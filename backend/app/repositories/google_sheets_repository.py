import os
import time
from google.oauth2 import service_account
from googleapiclient.discovery import build
from enum import Enum
import pandas as pd

class TableSheets(Enum):
    ACCOUNTS = 'accounts'
    PURCHASES = 'purchases'
    VENDORS = 'vendors'
    TRANSFERS = 'transfers'
    SALARIES = 'salaries'
    PRODUCTION_PURCHASES = 'production_purchases'
    PAYMENTS = 'payments'
    INVOICE = 'invoice'
    EXPENSES = 'expenses'
    EMPLOYEE_REGISTRATION = 'employee_registration'
    CUSTOMER_REGISTRATION = 'customer_registration'

class GoogleSheetRepository:
    # Each table now maps to a list of sheet definitions.
    TABLE_TO_SHEET_MAPPER = {
        TableSheets.ACCOUNTS: [
            {'spreadsheet_id': '1ZUz53zq3q9eQMgshMmW8axzyiTplZyUPSLsyjg0jBc4', 'sheet_name': 'main'}
        ],
        TableSheets.PURCHASES: [
            {'spreadsheet_id': '1jHp7OFhjfKz7QIJEAeLRKJGmVFhuiJySGkNWxekJiNU', 'sheet_name': 'Form Responses 1'},
            {'spreadsheet_id': '1iceUUkUDbFCSEgqj8k97Ko9WnLsBjq6Ee6tWwKnyiMU', 'sheet_name': 'Form Responses 1'}
        ],
        TableSheets.VENDORS: [
            {'spreadsheet_id': '1oAmx9g4qxaZyCQOR2TO1Wva04lcdYDjYdd7b2_GMmMA', 'sheet_name': 'main'}
        ],
        TableSheets.TRANSFERS: [
            {'spreadsheet_id': '1S2wbYAG1trhf1ukwMMq2iVJzgFhnKpeLH2jqcx7YEuQ', 'sheet_name': 'main'}
        ],
        TableSheets.SALARIES: [
            {'spreadsheet_id': '1zWskp5UNq7KTJsH_DO0xhIvPhTGXYpyB3xuxE0HTxPM', 'sheet_name': 'main'},
            {'spreadsheet_id': '1_4--THfe3mn1JogknKvfkiwXc7XFbGLGtDwZcyHXSDQ', 'sheet_name': 'Form Responses 1'}
        ],
        TableSheets.PRODUCTION_PURCHASES: [
            {'spreadsheet_id': '17aRoh5AWmykuyS6Ex4ZN1wx2D-2LFOGdVRRC0ac5KfY', 'sheet_name': 'Form Responses 1'},
            {'spreadsheet_id': '1BINyyADOy51evE34jc-NmeXuPiC2SCDuJOwsSoObIGo', 'sheet_name': 'Form Responses 1'}
        ],
        TableSheets.PAYMENTS: [
            {'spreadsheet_id': '1I1mBLdsk1CAcLQsVblolCIz1zqSTYZURe0vUfS5rlIo', 'sheet_name': 'main'}
        ],
        TableSheets.INVOICE: [
            {'spreadsheet_id': '1hA_A6ozG_m-48BE7nvPD-b6NCLwc5TzGgTnkwB213Fo', 'sheet_name': 'main'}
        ],
        TableSheets.EXPENSES: [
            {'spreadsheet_id': '1D5ihxWl2bM3_j8EQ0ABdEvH9HnuCXF1shmqd6CRqhcY', 'sheet_name': 'Form Responses 1'}
        ],
        TableSheets.EMPLOYEE_REGISTRATION: [
            {'spreadsheet_id': '1hUP8oDkHIsZC74rpU_uy5hLEWaPdl-Obu2d1THNwcsY', 'sheet_name': 'main'}
        ],
        TableSheets.CUSTOMER_REGISTRATION: [
            {'spreadsheet_id': '1ipZbj9waKoDSNohDnjaNmZh39h1sk2cQFuW4HHcWBUU', 'sheet_name': 'main'}
        ]
    }

    CACHE_EXPIRY_SECONDS = 600  # 10 minutes

    def __init__(self):
        creds = service_account.Credentials.from_service_account_file(
            os.getenv('GOOGLE_APPLICATION_CREDENTIALS'),
            scopes=['https://www.googleapis.com/auth/spreadsheets']
        )
        self.service = build('sheets', 'v4', credentials=creds)
        self.cache = {}  # Dictionary to store cached data per table

    def get_all(self, table: TableSheets) -> pd.DataFrame:
        # Check if there's a valid cached response
        cache_entry = self.cache.get(table)
        if cache_entry:
            cached_df, timestamp = cache_entry
            if time.time() - timestamp < self.CACHE_EXPIRY_SECONDS:
                return cached_df

        # Get the list of sheets for the table.
        sheets_info = self.TABLE_TO_SHEET_MAPPER.get(table, [])
        all_dataframes = []

        for sheet_def in sheets_info:
            spreadsheet_id = sheet_def['spreadsheet_id']
            sheet_name = sheet_def['sheet_name']
            result = self.service.spreadsheets().values().get(
                spreadsheetId=spreadsheet_id,
                range=sheet_name
            ).execute()
            values = result.get('values', [])
            if not values:
                # Skip if there is no data in this sheet.
                continue
            # Use the first row as header and the rest as data.
            header, *data = values
            df = pd.DataFrame(data, columns=header)
            all_dataframes.append(df)

        if all_dataframes:
            # Concatenate data from all sheets and drop rows with any missing values.
            for df in all_dataframes:
                df.dropna(inplace=True)
            combined_df = pd.concat(all_dataframes, ignore_index=True)
        else:
            # Return an empty DataFrame if no sheets had data.
            combined_df = pd.DataFrame()

        # Update the cache with the new DataFrame and the current timestamp.
        self.cache[table] = (combined_df, time.time())

        return combined_df
