FROM composer:2 AS deps
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --prefer-dist --no-progress --no-scripts

FROM php:8.3-apache-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libzip-dev libonig-dev libcurl4-openssl-dev unzip \
    && docker-php-ext-install pdo_mysql zip mbstring curl \
    && rm -rf /var/lib/apt/lists/* \
    && a2enmod rewrite headers
WORKDIR /var/www/html
COPY . .
COPY --from=deps /app/vendor ./vendor
COPY docker/000-default.conf /etc/apache2/sites-available/000-default.conf
COPY docker/start.sh /usr/local/bin/ecc-start
RUN chmod +x /usr/local/bin/ecc-start \
    && mkdir -p storage/logs storage/framework/cache storage/framework/sessions storage/framework/views bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && php artisan package:discover --ansi
EXPOSE 8080
CMD ["ecc-start"]
