"""The health probe that deploy.sh uses to accept or roll back a release."""
from unittest import mock

from django.db import OperationalError
from rest_framework.test import APITestCase


class HealthTests(APITestCase):
    def test_reports_ok_and_running_version_without_login(self):
        with mock.patch.dict('os.environ', {'APP_VERSION': 'v1.2.3'}):
            response = self.client.get('/api/health/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok', 'version': 'v1.2.3'})

    def test_database_failure_returns_503(self):
        with mock.patch('core.views.health.connection.cursor', side_effect=OperationalError('down')):
            response = self.client.get('/api/health/')

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['status'], 'error')
