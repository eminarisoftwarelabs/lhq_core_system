from rest_framework import serializers

from .services import PERIODS


class _MoneyField(serializers.DecimalField):
    """Money as a 2dp string, the same shape billing's invoice API uses -
    a bare Decimal in a Response would go out as a lossy JSON float."""

    def __init__(self, **kwargs):
        super().__init__(max_digits=14, decimal_places=2, **kwargs)


class PeriodSerializer(serializers.Serializer):
    key = serializers.ChoiceField(choices=PERIODS)
    start = serializers.DateField()
    end = serializers.DateField(help_text='Exclusive: the first day after the period.')


class CountsSerializer(serializers.Serializer):
    active_students = serializers.IntegerField()
    tutors = serializers.IntegerField()
    active_subjects = serializers.IntegerField()
    open_enquiries = serializers.IntegerField()


class MoneySerializer(serializers.Serializer):
    invoiced = _MoneyField()
    collected = _MoneyField()
    outstanding = _MoneyField()
    overdue_amount = _MoneyField()
    overdue_count = serializers.IntegerField()


class TrendMonthSerializer(serializers.Serializer):
    month = serializers.CharField(help_text='YYYY-MM')
    enrolled = serializers.IntegerField()
    withdrawn = serializers.IntegerField()


class FunnelStageSerializer(serializers.Serializer):
    stage = serializers.CharField()
    label = serializers.CharField()
    count = serializers.IntegerField()


class FunnelSerializer(serializers.Serializer):
    stages = FunnelStageSerializer(many=True)
    total = serializers.IntegerField()
    enrolled = serializers.IntegerField()
    conversion_rate = serializers.FloatField(allow_null=True, help_text='0-1, null with no enquiries.')


class OverviewSerializer(serializers.Serializer):
    period = PeriodSerializer()
    counts = CountsSerializer()
    money = MoneySerializer()
    enrollment_trend = TrendMonthSerializer(many=True)
    funnel = FunnelSerializer()
