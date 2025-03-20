const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { google } = require('googleapis');

// Path to your service account credentials file (adjust the path if needed)
const SERVICE_ACCOUNT_FILE = '/Users/zaid/Downloads/lithe-elixir-178918-729df7a7ad44.json';

// Define the required scopes for read-only access to spreadsheets
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

// Load your service account credentials
const credentials = require(SERVICE_ACCOUNT_FILE);

// IMPORTANT: Replace any escaped newline characters in the private key with actual newlines.
const privateKey = credentials.private_key.replace(/\\n/g, '\n');

// Create a JWT client using your service account credentials
const jwtClient = new google.auth.JWT(
    credentials.client_email,
    null,
    privateKey,
    SCOPES,
    null
);

// Build the Sheets API service using the JWT client
const sheets = google.sheets({ version: 'v4', auth: jwtClient });

// IPC handler: dynamically accepts spreadsheetId and range
ipcMain.handle('fetch-sheet-data', async (event, spreadsheetId, range) => {
    try {
        // Authorize the JWT client (this works similar to your Python code)
        await jwtClient.authorize();

        // Fetch data from the specified spreadsheet and range
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });

        const data = res.data.values;
        console.log("Fetched data:", JSON.stringify(data, null, 2));
        return data;
    } catch (error) {
        console.error("Error fetching data:", error);
        return { error: error.message };
    }
});

function createWindow() {
    const win = new BrowserWindow({
        width: 1024,
        height: 768,
        webPreferences: {
            nodeIntegration: true,  // Enabled for simplicity; in production consider preload scripts
            contextIsolation: false
        }
    });

    win.loadFile(path.join(__dirname, 'pages', 'home', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
