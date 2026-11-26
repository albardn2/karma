"""Load test for the Karma API against the tenants loadtest/seed.sql creates.

Two kinds of simulated people, in proportion to a real tenant:

- FieldUser: staff on the mobile app. Opens trips, customers, orders and their
  own stats, with a long think time between screens.
- OfficeUser: an admin on the web console, mostly on the heavy dashboards.

Each simulated person signs in as a distinct seeded user (`lt-<company>-<n>`),
so requests are spread over every company the way real traffic is.

Location pings travel over MQTT, not HTTP, and are not simulated here.
"""
import itertools
import os
import random
import threading

from locust import HttpUser, between, task

COMPANIES = int(os.environ["LT_COMPANIES"])
USERS_PER_COMPANY = int(os.environ["LT_USERS"])
PASSWORD = os.environ["LT_PASSWORD"]
PAGE = "page=1&per_page=20"

_next_index = itertools.count()
_index_lock = threading.Lock()


def _next_username(first_user: int) -> str:
    """Round-robin over companies, so the n-th simulated person lands in company
    n % COMPANIES and every company carries a share of the load."""
    with _index_lock:
        n = next(_next_index)
    company = 1 + n % COMPANIES
    user = first_user + (n // COMPANIES) % (USERS_PER_COMPANY - first_user + 1)
    return f"lt-{company}-{user}"


class _SignedIn(HttpUser):
    abstract = True
    first_user = 1

    def on_start(self) -> None:
        username = _next_username(self.first_user)
        response = self.client.post("/auth/login", json={"username_or_email": username, "password": PASSWORD},
                                    name="/auth/login")
        response.raise_for_status()
        self.client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
        self.client.get("/auth/me")


class FieldUser(_SignedIn):
    weight = 9
    first_user = 2
    wait_time = between(5, 20)

    def on_start(self) -> None:
        super().on_start()
        self.client.get("/location/client-config")

    @task(3)
    def trips(self) -> None:
        self.client.get(f"/trip/?{PAGE}", name="/trip/")

    @task(3)
    def customers(self) -> None:
        self.client.get(f"/customer/?{PAGE}", name="/customer/")

    @task(2)
    def orders(self) -> None:
        self.client.get(f"/customer-order/?{PAGE}", name="/customer-order/")

    @task(2)
    def materials(self) -> None:
        self.client.get("/material/", name="/material/")

    @task(2)
    def me(self) -> None:
        self.client.get("/auth/me")

    @task(1)
    def my_stats(self) -> None:
        self.client.get("/dashboard/my-trip-stops?granularity=day", name="/dashboard/my-trip-stops")


class OfficeUser(_SignedIn):
    weight = 1
    first_user = 1
    wait_time = between(10, 30)

    @task(3)
    def overview(self) -> None:
        self.client.get(f"/dashboard/overview?days={random.choice([7, 30, 90])}", name="/dashboard/overview")

    @task(1)
    def profitability(self) -> None:
        self.client.get("/dashboard/profitability?granularity=month&target_currency=USD",
                        name="/dashboard/profitability")

    @task(1)
    def trip_stops(self) -> None:
        self.client.get("/dashboard/trip-stops?granularity=day", name="/dashboard/trip-stops")

    @task(1)
    def customer_orders(self) -> None:
        self.client.get("/dashboard/customer-orders?granularity=day", name="/dashboard/customer-orders")

    @task(2)
    def customer_list(self) -> None:
        self.client.get("/customer/?page=1&per_page=100", name="/customer/ (100)")

    @task(1)
    def trip_filters(self) -> None:
        self.client.get("/trip/filter-options", name="/trip/filter-options")

    @task(2)
    def trips(self) -> None:
        self.client.get(f"/trip/?{PAGE}", name="/trip/")
