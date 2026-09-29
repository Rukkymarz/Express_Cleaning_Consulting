#!/bin/sh
set -eu
: "${PORT:=8080}"
rm -f /etc/apache2/mods-enabled/mpm_event.load /etc/apache2/mods-enabled/mpm_event.conf \
      /etc/apache2/mods-enabled/mpm_worker.load /etc/apache2/mods-enabled/mpm_worker.conf
a2enmod mpm_prefork >/dev/null
printf 'Listen %s\n' "$PORT" > /etc/apache2/ports.conf
sed -i "s/<VirtualHost \*:8080>/<VirtualHost *:$PORT>/" /etc/apache2/sites-available/000-default.conf
apache2ctl -t
exec apache2-foreground
