# Google Authentication Setup

To make the "Sign in with Google" button work, you must configure the **Authorized JavaScript origins** in your Google Cloud Console.

## 1. Go to Google Cloud Console
Open the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and select your project.

## 2. Edit OAuth 2.0 Client ID
1.  Navigate to **APIs & Services** > **Credentials**.
2.  Click on the pencil icon (Edit) next to your Web Application Client ID (the one matching `NEXT_PUBLIC_GOOGLE_CLIENT_ID`).

## 3. Add Authorized Origins
Under **Authorized JavaScript origins**, add the following URIs:

*   `http://localhost:3000` (For local development)
*   `https://vocado.eu` (For production)
*   `https://www.vocado.eu` (Recommended)

> **Note:** You do NOT need to add anything to "Authorized redirect URIs" for this implementation.

## 4. Save
Click **Save**. It may take 5-10 minutes for the changes to take effect.
