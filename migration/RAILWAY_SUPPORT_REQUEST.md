# Railway no-cost export/grace request

Prepared 2026-11-02. This is a draft for the account owner to review and send;
it has not been submitted to Railway.

## Subject

Request no-cost read-only export or retention grace before 2026-11-28 volume deletion

## Message

Hello Railway Support,

Our Express Cleaning Consult workspace has an expired trial with paused web,
API, and MySQL services. We need to preserve customer records while migrating
to a free replacement. The workspace UI currently requires a paid Hobby upgrade
to resume MySQL, but we do not want to restart normal deployments or purchase a
plan merely to recover our own data.

The project still shows:

- a MySQL volume scheduled for deletion on November 28, 2026; and
- a 186 MB backup named “Pre-Security-Patch Backup.”

Please provide one of these no-cost recovery options before deletion:

1. a downloadable logical MySQL export and, if available, a downloadable archive
   of the attached volume;
2. a temporary read-only database/export window with outbound access restricted
   to the account owner; or
3. a retention extension while support prepares the export.

Please do not delete, overwrite, restore over, or restart application deployments
as part of this request. We need an immutable/read-only recovery path and source
row counts so the export can be validated before import.

Please confirm the exact deletion timestamp, whether the backup includes the
volume contents or only the database, and the secure method for receiving the
export.

Thank you.

## Before sending

Add the Railway workspace/project identifier from the signed-in dashboard. Do
not include database passwords, connection URLs, API tokens, customer records,
or backup contents in the support message.
