from datetime import datetime
from enum import Enum
from typing import Optional, Tuple, List
import pandas as pd
from app.repositories.google_sheets_repository import GoogleSheetRepository
from app.repositories.google_sheets_repository import TableSheets
from pydantic import BaseModel

from app.repositories import google_sheet_repository


class AccountBalanceEvent(BaseModel):
    event_date: str
    event_type: str # str tied to enum
    amount: float
    metadata: dict = {}

class EventType(Enum):
    PURCHASE = 'purchase'
    TRANSFER = 'transfer'
    SALARY = 'salary'
    PRODUCTION_PURCHASE = 'production_purchase'
    PAYMENT = 'payment'
    INVOICE = 'invoice'
    EXPENSE = 'expense'


class FinancialsDomain:

    #HACK
    MAIN_ACCOUNT = 'acc_pcg9l_00000003'

    def __init__(self):
        self.google_sheet_repository = google_sheet_repository

    def generate_balance_delta_monthly(self,account_id: str) -> tuple[float, str]:
        # get all events
        events = self.get_account_events(account_id)
        # filter by month
        events['event_date'] = pd.to_datetime(events['event_date'])
        # filter by month
        events['month'] = events['event_date'].dt.to_period('M')
        # group by month
        events_grouped = events.groupby('month').agg({'amount': 'sum'}).reset_index()

        # return tuple series balance and month(str)
        return [(row['amount'], row['month'].strftime('%Y-%m')) for _, row in events_grouped.iterrows()]










    def get_account_balance(self, account_id: str, starting_balance: tuple[float, datetime] = None):
        cumsum = self.generate_balance_cumulitive_sum(account_id, starting_balance)
        return cumsum[-1][0]

    def generate_balance_cumulitive_sum(
            self,
            account_id: str,
            start: Optional[Tuple[float, datetime]] = None
    ) -> List[Tuple[float, str]]:
        """
        Generate a time series of cumulative balances from a DataFrame of events.

        Parameters:
            events (pd.DataFrame): DataFrame with at least two columns:
                - 'date': the timestamp of the event (datetime-compatible string or object)
                - 'amount': the amount to add (or subtract) from the balance.
            start (Optional[Tuple[float, datetime]]): A tuple containing the starting balance and date.
                If provided, this tuple is the first entry in the resulting time series.
                If not provided, the starting balance defaults to 0.

        Returns:
            List[Tuple[float, datetime]]: A list of tuples, each representing (balance, date) in chronological order.
            :param start:
            :param account_id:
        """
        # Ensure the 'date' column is converted to native Python datetime objects
        events = self.get_account_events(account_id)
        events = events.copy()

        # event date should be in format 7/27/2024 18:31:40

        events['event_date'] = pd.to_datetime(events['event_date']).dt.to_pydatetime()
        # fix make isoformat
        events['event_date'] = events['event_date'].apply(lambda x: x.isoformat())

        # Sort events by date
        events_sorted = events.sort_values(by='event_date')

        # Initialize the time series list and starting balance
        time_series: List[Tuple[float, datetime]] = []

        if start is not None:
            balance, start_date = start
            time_series.append((balance, start_date))
        else:
            balance = 0.0

        # Process each event to update the balance and record the timestamp
        for _, row in events_sorted.iterrows():
            event_date = row['event_date']
            amount = row['amount']
            balance += amount
            time_series.append((balance, event_date))



        return time_series

    def get_account_events(self, account_id: str):
        # Load dataframes from the google sheet repository
        accounts = self.google_sheet_repository.get_all(TableSheets.ACCOUNTS)
        transfers = self.google_sheet_repository.get_all(TableSheets.TRANSFERS)
        purchases = self.google_sheet_repository.get_all(TableSheets.PURCHASES)
        salaries = self.google_sheet_repository.get_all(TableSheets.SALARIES)
        production_purchases = self.google_sheet_repository.get_all(TableSheets.PRODUCTION_PURCHASES)
        payments = self.google_sheet_repository.get_all(TableSheets.PAYMENTS)
        expenses = self.google_sheet_repository.get_all(TableSheets.EXPENSES)

        # return salaries

        # Create an empty DataFrame with the needed columns
        events_df = pd.DataFrame(columns=['event_date', 'event_type', 'amount', 'metadata'])

        # Process non-transfer events only for the main account
        if account_id == self.MAIN_ACCOUNT:
            # Process purchases: Timestamp -> event_date, total_price -> amount
            if not purchases.empty:
                df = purchases[['Timestamp', 'total_price']].copy()
                df['event_date'] = df['Timestamp']
                df['amount'] = df['total_price'].apply(self.parse_amount) * -1
                df['event_type'] = EventType.PURCHASE.value
                df['metadata'] = [{}] * len(df)
                df = df[['event_date', 'event_type', 'amount', 'metadata']]
                events_df = pd.concat([events_df, df], ignore_index=True)

            # Process production purchases similarly
            if not production_purchases.empty:
                df = production_purchases[['Timestamp', 'total_price']].copy()
                df['event_date'] = df['Timestamp']
                df['amount'] = df['total_price'].apply(self.parse_amount) * -1
                df['event_type'] = EventType.PRODUCTION_PURCHASE.value
                df['metadata'] = [{}] * len(df)
                df = df[['event_date', 'event_type', 'amount', 'metadata']]
                events_df = pd.concat([events_df, df], ignore_index=True)

            # Process salaries: Timestamp -> event_date, amount remains amount
            if not salaries.empty:
                df = salaries[['Timestamp', 'amount']].copy()
                df['amount'] = df['amount'].apply(self.parse_amount) * -1
                df['event_date'] = df['Timestamp']
                df['event_type'] = EventType.SALARY.value
                df['metadata'] = [{}] * len(df)
                df = df[['event_date', 'event_type', 'amount', 'metadata']]
                events_df = pd.concat([events_df, df], ignore_index=True)

            # Process payments: Timestamp -> event_date, amount remains amount
            if not payments.empty:
                df = payments[['Timestamp', 'amount']].copy()
                df['amount'] = df['amount'].apply(self.parse_amount)
                df['event_date'] = df['Timestamp']
                df['event_type'] = EventType.PAYMENT.value
                df['metadata'] = [{}] * len(df)
                df = df[['event_date', 'event_type', 'amount', 'metadata']]
                events_df = pd.concat([events_df, df], ignore_index=True)

            # Process expenses: Timestamp -> event_date, Amount Paid -> amount
            if not expenses.empty:
                df = expenses[['Timestamp', 'Amount Paid']].copy()
                df['event_date'] = df['Timestamp']
                df['amount'] = df['Amount Paid'].apply(self.parse_amount) * -1
                df['event_type'] = EventType.EXPENSE.value
                df['metadata'] = [{}] * len(df)
                df = df[['event_date', 'event_type', 'amount', 'metadata']]
                events_df = pd.concat([events_df, df], ignore_index=True)

        # -- Process Transfers (for any account) --

        # Find the desired account's currency from the accounts table.
        # Assumes that the "id" column in accounts uniquely identifies an account.
        desired_account = accounts[accounts['id'] == account_id]
        if desired_account.empty:
            raise ValueError(f"Account {account_id} not found in accounts table.")
        desired_currency = desired_account.iloc[0]['currency'].lower()

        # Filter transfers where this account is either the sender or the receiver
        if not transfers.empty:
            outgoing = transfers[transfers['From Account'] == account_id].copy()
            incoming = transfers[transfers['To Account'] == account_id].copy()

            # Define a conversion function to ensure the amount is in the desired currency.
            # conversion rate is given as syp per usd.
            def convert_amount(row):
                amt = self.parse_amount(row['Amount'])
                trans_currency = row['currency'].lower()
                if trans_currency != desired_currency:
                    rate = row['conversion rate (usd to syp)']
                    # If desired currency is syp and the transfer is in usd, multiply.
                    if desired_currency == 'syp' and trans_currency == 'usd':
                        return amt * rate
                    # If desired currency is usd and the transfer is in syp, divide.
                    elif desired_currency == 'usd' and trans_currency == 'syp':
                        return amt / rate
                    else:
                        # For any other currency combination, leave as is.
                        raise ValueError(f"Unsupported currency conversion {trans_currency} to desired currency {desired_currency}")

                else:
                    return amt

            # Process outgoing transfers
            if not outgoing.empty:
                outgoing['amount'] = outgoing.apply(convert_amount, axis=1) * -1
                outgoing['event_date'] = outgoing['Timestamp']
                outgoing['event_type'] = EventType.TRANSFER.value
                outgoing['metadata'] = [{}] * len(outgoing)
                outgoing = outgoing[['event_date', 'event_type', 'amount', 'metadata']]
                events_df = pd.concat([events_df, outgoing], ignore_index=True)

            # Process incoming transfers
            if not incoming.empty:
                incoming['amount'] = incoming.apply(convert_amount, axis=1)
                incoming['event_date'] = incoming['Timestamp']
                incoming['event_type'] = EventType.TRANSFER.value
                incoming['metadata'] = [{}] * len(incoming)
                incoming = incoming[['event_date', 'event_type', 'amount', 'metadata']]
                events_df = pd.concat([events_df, incoming], ignore_index=True)

        # Optionally sort the events by date (if the date format allows for lexicographical sorting)
        events_df.sort_values(by='event_date', inplace=True)
        events_df.reset_index(drop=True, inplace=True)

        return events_df


    def parse_amount(self, value):
        """Convert a string with possible commas to float."""
        try:
            if isinstance(value, str):
                value = value.replace(',', '')
            return float(value)
        except (ValueError, TypeError):
            return 0.0

    def parse_timestamp(self, value):
        """Parse timestamp from format: M/D/YYYY H:M:S (e.g., 8/23/2024 14:41:25)."""
        try:
            return datetime.strptime(value, "%m/%d/%Y %H:%M:%S")
        except Exception:
            return None


