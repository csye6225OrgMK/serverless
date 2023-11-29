import { Storage } from '@google-cloud/storage';
import fetch from 'node-fetch';
import mailgun from 'mailgun-js';
import dotenv from 'dotenv';
import AWS from 'aws-sdk';

dotenv.config();

const mg = mailgun({ apiKey: process.env.MAILGUN_API_KEY, domain: process.env.DOMAIN });
const dynamoDBName = process.env.DYNAMODB_TABLE_NAME;
const dynamoDB = new AWS.DynamoDB.DocumentClient();

console.log('DB NAME:', dynamoDB);

const GCP_decodedPrivateKey = Buffer.from(process.env.GCP_SERVICE_ACCOUNT_KEY, 'base64').toString('utf-8');
const GCP_keyFileJson = JSON.parse(GCP_decodedPrivateKey);


const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID,
  credentials: GCP_keyFileJson,
});

console.log(process.env.GCP_SERVICE_ACCOUNT_KEY, GCP_keyFileJson);
console.log(process.env.GCP_PROJECT_ID);
console.log(process.env.MAILGUN_API_KEY);
console.log(process.env.DYNAMODB_TABLE_NAME);
console.log(process.env.DOMAIN);

async function handler(event) {
  try {
    // const [buckets] = await storage.getBuckets();
    const snsMessage = JSON.parse(event.Records[0].Sns.Message);
    const userEmail = snsMessage.userEmail;
    console.log('userEmail: ',userEmail, 'typeof: ', typeof userEmail);
    const githubRepoUrl = snsMessage.githubRepoUrl;
    const bucketName = process.env.GOOGLE_STORAGE_BUCKET_NAME;
    const fileName = 'release.zip';
    
    const response = await fetch(githubRepoUrl);

    if (!response.ok) {
      await sendEmail(userEmail, 'Error downloading release from GitHub');
      await trackEmail(userEmail, 'Error downloading release from GitHub');
      return;
    }

    const buffer = await response.buffer();

    try {
      // Upload the buffer to Google Cloud Storage
      await storage.bucket(bucketName).file(fileName).save(buffer);
      await sendEmail(userEmail, 'Release download and upload successful');
      await trackEmail(userEmail, 'Release download and upload successful');
    } catch (error) {
      await sendEmail(userEmail, 'Error uploading release to Google Cloud Storage');
      await trackEmail(userEmail, 'Error uploading release to Google Cloud Storage');
      return;
    }
  } catch (error) {
    console.error('Error in handler function:', error);
  }
}

async function sendEmail(email, message) {
  const data = {
    from: 'csye6225mk@demo.talentofpainting.info',
    to: email,
    subject: 'Details of your assignment submission',
    text: message,
  };

  mg.messages().send(data, (error, body) => {
    if (error) {
      console.error(`Error sending email: ${error.message}`);
      return;
    }
    console.log(`Email sent: ${body.message}`);
  });
}

async function trackEmail(email, status) {
  const params = {
    TableName: dynamoDBName,
    Item: {
      'emailId': { S: email },
      'Status': { S: status },
      'sentAt': { N: `${Date.now()}` },
    },
  };

  try {
    await dynamoDB.put(params).promise();
  } catch (error) {
    console.error('Error tracking email:', error);
  }
}

export { handler };

