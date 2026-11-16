from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    is_read = serializers.BooleanField(read_only=True)

    class Meta:
        model = Notification
        fields = ['id', 'message', 'link', 'created_at', 'read_at', 'is_read']
        read_only_fields = fields


class NotificationListSerializer(serializers.Serializer):
    unread_count = serializers.IntegerField()
    results = NotificationSerializer(many=True)
