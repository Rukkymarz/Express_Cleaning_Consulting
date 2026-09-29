<?php
use Illuminate\Support\Facades\Schedule;
Schedule::call(fn () => app(\App\Services\CampaignService::class)->dispatchDue())->name('campaigns.dispatch-due')->everyMinute()->withoutOverlapping();
