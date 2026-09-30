#!/bin/sh
set -u

while true; do
    php artisan quote-notifications:recover --limit=50 || true
    sleep 60
done
