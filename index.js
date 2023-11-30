import { Storage } from '@google-cloud/storage';
import fetch from 'node-fetch';
import mailgun from 'mailgun-js';
import dotenv from 'dotenv';
import AWS from 'aws-sdk';

dotenv.config();

const mg = mailgun({ apiKey: process.env.MAILGUN_API_KEY, domain: process.env.DOMAIN });
const dynamoDBName = process.env.DYNAMODB_TABLE_NAME;
const dynamoDB = new AWS.DynamoDB.DocumentClient();

const GCP_decodedPrivateKey = Buffer.from(process.env.GCP_SERVICE_ACCOUNT_KEY, 'base64').toString('utf-8');
const GCP_keyFileJson = JSON.parse(GCP_decodedPrivateKey);

const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID,
  credentials: GCP_keyFileJson,
});

async function handler(event) {
  try {
    if (!event || !event.Records) {
      throw new Error('Invalid event or missing Records');
    }

    const snsRecords = event.Records.filter(
      (record) => record.EventSource === 'aws:sns'
    );

    for (const snsRecord of snsRecords) {
      if (snsRecord.Sns && snsRecord.Sns.Message) {
        console.log('SNS Message:', snsRecord.Sns.Message);
        const snsMessage = JSON.parse(snsRecord.Sns.Message);
        console.log('SNS Message After parsing:', snsMessage);
        const userEmail = snsMessage.userEmail;
        const githubRepoUrl = snsMessage.githubRepoUrl;
        const bucketName = process.env.GOOGLE_STORAGE_BUCKET_NAME;
        const bucketUrl = process.env.GOOGLE_STORAGE_BUCKET_URL;
        const rejectionReason = snsMessage.rejectionReason;
        const fileName = `AssignmentSubmission${Date.now()}.zip`;

        const isValidUrl = (url) => {
          try {
            const urlObj = new URL(url);
            return urlObj.pathname.endsWith('.zip'); // Check if the URL ends with .zip
          } catch (error) {
            return false;
          }
        };
        
        if (!isValidUrl(githubRepoUrl)) {
          console.error('Invalid GitHub repository URL');
          await send(userEmail, 'Please submit a valid url', snsMessage, bucketUrl);
          await track(userEmail, 'Submitted url is not valid');
          return; 
        }
        
        const response = await fetch(githubRepoUrl); 

        if (!response.ok) {
          await sendEmail(userEmail, 'Error downloading release from GitHub', snsMessage, bucketUrl);
          await trackEmail(userEmail, 'Error downloading release from GitHub');
          return;
        }

        if (rejectionReason) {
          await sendEmail(userEmail, 'Your submission has been rejected', snsMessage, bucketUrl);
          await trackEmail(userEmail, 'Submission rejected');
          return;
        }

        const buffer = await response.buffer();

        try {
          await storage.bucket(bucketName).file(fileName).save(buffer);
          await sendEmail(userEmail, 'Release download and uploaded successfully to google cloud', snsMessage, bucketUrl);
          await trackEmail(userEmail, 'Release download and upload successful');
        } catch (error) {
          await sendEmail(userEmail, 'Error uploading release to Google Cloud Storage', snsMessage, bucketUrl);
          await trackEmail(userEmail, 'Error uploading release to Google Cloud Storage');
          return;
        }
      } else {
        console.error('SNS record does not contain expected message data');
      }
    }
  } catch (error) {
    console.error('Error in handler function:', error);
  }
}

async function sendEmail(email, message, snsMessage, bucketUrl) {
  const data = {
    from: 'Madhura Kurhadkar <madhurak@talentofpainting.info>',
    to: 'madhura.kurhadkar@gmail.com',
    subject: 'Submission details for assignment: '+snsMessage.assignment,
    text: `${message}\n\nThank you for your submission! Below are the details:\n\n` +
      `User Email: ${email}\n` +
      `Submitted GitHub Repository URL: ${snsMessage.githubRepoUrl}\n` +
      `Google Bucket URL: ${bucketUrl}\n` +
      `${snsMessage.rejectionReason ? `Rejection Reason: ${snsMessage.rejectionReason}\n` : ''}` +
      `If you have any questions or concerns, feel free to reach out.\n\nBest regards,\nMadhura Kurhadkar`,
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
      'emailId': email,
      'Status': status,
      'sentAt': `${Date.now()}`,
    },
  };

  try {
    await dynamoDB.put(params).promise();
  } catch (error) {
    console.error('Error tracking email:', error);
  }
}

export { handler };

