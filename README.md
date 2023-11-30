# Assignment Submission Service

This service handles the submission of assignments, verifies the content, and uploads valid submissions to Google Cloud Storage.

## Setup

### Prerequisites

1. Node.js installed locally.
2. AWS and Google Cloud Storage accounts and respective access credentials.
3. Mailgun API key and domain.

### Installation

1. Clone this repository.
2. Install dependencies by running: `npm install`.
3. Set up the necessary environment variables in a `.env` file:
    ```
    MAILGUN_API_KEY=your_mailgun_api_key
    DOMAIN=your_domain
    DYNAMODB_TABLE_NAME=your_dynamodb_table_name
    GCP_SERVICE_ACCOUNT_KEY=your_base64_encoded_service_account_key
    GCP_PROJECT_ID=your_project_id
    GOOGLE_STORAGE_BUCKET_NAME=your_storage_bucket_name
    GOOGLE_STORAGE_BUCKET_URL=your_storage_bucket_url
    ```

### Usage

1. Run the service using: `npm start`.
2. The service listens to AWS SNS notifications triggered by new assignment submissions.

## Code Structure

- `handler(event)`: Entry point for processing submission events.
- `sendEmail(email, message, snsMessage, bucketUrl)`: Sends emails based on submission status.
- `trackEmail(email, status)`: Tracks email delivery status in DynamoDB.

## Error Handling

- Invalid event or missing Records in SNS notifications.
- Invalid GitHub repository URL provided.
- Error downloading or uploading the submission.
- Rejection of submission due to specified reasons.
- Tracking errors in email delivery.
