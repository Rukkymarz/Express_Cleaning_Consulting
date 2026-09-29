#!/bin/sh
set -eu
: "${PORT:=8080}"
printf 'Listen %s\n' "$PORT" > /etc/apache2/ports.conf
sed -i "s/<VirtualHost \*:8080>/<VirtualHost *:$PORT>/" /etc/apache2/sites-available/000-default.conf
exec apache2-foreground
