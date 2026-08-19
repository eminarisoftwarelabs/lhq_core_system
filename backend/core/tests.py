from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase


class HealthCheckTests(APITestCase):
    def test_returns_ok_status(self):
        response = self.client.get(reverse('health-check'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'ok')

    def test_response_is_json(self):
        response = self.client.get(reverse('health-check'))

        self.assertEqual(response['Content-Type'], 'application/json')

    def test_does_not_require_authentication(self):
        response = self.client.get(reverse('health-check'))

        self.assertNotEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotEqual(response.status_code, status.HTTP_403_FORBIDDEN)
