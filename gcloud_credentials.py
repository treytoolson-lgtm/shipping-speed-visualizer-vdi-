"""Auto-refreshing credentials that use gcloud CLI under the hood.

The BQ Python client uses ADC by default, but ADC often lacks the
serviceusage.serviceUsageConsumer role on Walmart projects. The bq CLI
works fine because it uses the regular gcloud auth login credentials.

This module bridges that gap: it shells out to `gcloud auth print-access-token`
to grab a fresh OAuth2 token and auto-refreshes when the token expires (~60 min).
"""

import os
import subprocess
from datetime import datetime, timezone, timedelta

from google.auth.credentials import Credentials

# How many minutes before actual expiry to trigger a refresh.
_REFRESH_BUFFER_MINUTES = 5
# gcloud tokens last ~60 minutes.
_TOKEN_LIFETIME_MINUTES = 55


def _find_gcloud_cmd() -> str:
    """Locate the gcloud CLI executable."""
    known_path = (
        r"C:\Users\t0t0ech\AppData\Local\Google"
        r"\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
    )
    if os.path.exists(known_path):
        return known_path
    return "gcloud"  # hope it's on PATH


def _fetch_access_token(gcloud_cmd: str) -> str:
    """Call gcloud to get a fresh access token."""
    return subprocess.check_output(
        [gcloud_cmd, "auth", "print-access-token"],
        text=True,
        shell=True,
        timeout=15,
    ).strip()


class GcloudUserCredentials(Credentials):
    """Google auth credentials that auto-refresh via `gcloud auth print-access-token`.

    Drop-in replacement for google.oauth2.credentials.Credentials that
    never goes stale — it re-fetches the token automatically.
    """

    def __init__(self) -> None:
        super().__init__()
        self._gcloud_cmd = _find_gcloud_cmd()
        self.token: str | None = None
        self.expiry: datetime | None = None
        # Grab the first token immediately so the client is ready to go.
        self.refresh(request=None)

    @property
    def valid(self) -> bool:
        if self.token is None or self.expiry is None:
            return False
        buffer = timedelta(minutes=_REFRESH_BUFFER_MINUTES)
        return datetime.now(timezone.utc) < (self.expiry - buffer)

    @property
    def expired(self) -> bool:
        return not self.valid

    def refresh(self, request) -> None:  # noqa: ARG002 — `request` unused but required by interface
        """Fetch a fresh access token from gcloud."""
        self.token = _fetch_access_token(self._gcloud_cmd)
        self.expiry = datetime.now(timezone.utc) + timedelta(
            minutes=_TOKEN_LIFETIME_MINUTES
        )

    def with_quota_project(self, quota_project: str) -> "GcloudUserCredentials":
        """Return self — quota project is set on the BQ Client, not credentials."""
        self._quota_project = quota_project
        return self
