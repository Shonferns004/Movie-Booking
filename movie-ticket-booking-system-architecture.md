# Online Movie Ticket Booking System --- Full System Architecture

**Document type:** System architecture and implementation blueprint\
**Status:** Proposed architecture; not yet implemented\
**Initial deployment model:** Single theatre with multiple auditoriums,
expandable to multiple theatres\
**Reference seating source:** `PVR SANGAM AUDI LAYOUT.xlsx` supplied by
the project owner

------------------------------------------------------------------------

## 1. Project objective

Build a production-oriented online movie ticket booking platform with
three distinct interfaces:

1.  **Customer website** --- browse movies, choose a show, select exact
    seats, pay online, and access tickets.
2.  **Admin panel** --- manage movies, theatre/auditorium configuration,
    seat layouts, showtimes, pricing, bookings, refunds, staff, and
    reports.
3.  **Ticket scanner interface** --- authorised theatre staff scan QR
    tickets at the entrance and validate admission against the backend.

All interfaces use a shared backend and PostgreSQL database. The backend
is the authority for prices, seat availability, payment status, booking
status, and ticket admission.

The system must never rely on browser state alone to decide whether a
seat is available, a payment succeeded, or a ticket is valid.

## 2. Baseline technology stack

  -----------------------------------------------------------------------
  Layer                   Technology              Responsibility
  ----------------------- ----------------------- -----------------------
  Customer UI             React + Vite            Movie browsing, show
                                                  selection, seat map,
                                                  checkout, My Tickets

  Admin UI                React + Vite            Movie, theatre, layout,
                                                  schedule, booking,
                                                  staff, and report
                                                  management

  Scanner UI              Responsive React        Camera-based QR
                          route/PWA               scanning and entry
                                                  validation

  API                     Node.js + Express       Business logic,
                                                  validation,
                                                  authentication,
                                                  authorization

  Database                PostgreSQL              Authoritative
                                                  persistent data and
                                                  transactional booking

  Validation              Zod or equivalent       Request/response schema
                                                  validation

  Image storage           S3-compatible object    Posters, thumbnails,
                          storage                 banners, and other
                                                  media

  Payments                Payment gateway such as Payment checkout,
                          Razorpay                payment events, refunds

  Email                   Transactional email     Booking confirmation
                          provider                and ticket delivery

  Background jobs         Node worker;            Hold expiry, email
                          database-backed         retries, payment
                          job/outbox tables       reconciliation

  Repository              GitHub monorepo         Source control, tests,
                                                  CI/CD

  Deployment              HTTPS web hosting, API  Production runtime
                          host, PostgreSQL,       
                          worker                  
  -----------------------------------------------------------------------

Choose the exact hosting and payment providers before production. Do not
hardcode provider-specific assumptions into the booking domain.

## 3. High-level system architecture

``` mermaid
flowchart TB
    C[Customer Website]
    A[Admin Panel]
    S[Staff Ticket Scanner]
    API[Node.js / Express API]
    AUTH[Authentication and RBAC]
    MOV[Movies and Media Module]
    THEATRE[Theatre and Layout Module]
    SHOW[Show Scheduling Module]
    INV[Seat Inventory and Holds]
    BOOK[Booking and Checkout Module]
    PAY[Payment Integration]
    TICK[Ticket Issuance and Validation]
    NOTIFY[Notification and Outbox Worker]
    REPORT[Reports and Audit Module]
    DB[(PostgreSQL)]
    OBJ[(Object Storage)]
    GATEWAY[Payment Gateway]
    EMAIL[Email Provider]

    C --> API
    A --> API
    S --> API
    API --> AUTH
    API --> MOV
    API --> THEATRE
    API --> SHOW
    API --> INV
    API --> BOOK
    API --> PAY
    API --> TICK
    API --> REPORT
    MOV --> OBJ
    AUTH --> DB
    MOV --> DB
    THEATRE --> DB
    SHOW --> DB
    INV --> DB
    BOOK --> DB
    PAY --> DB
    TICK --> DB
    REPORT --> DB
    PAY <--> GATEWAY
    NOTIFY --> DB
    NOTIFY --> EMAIL
    BOOK --> NOTIFY
    TICK --> NOTIFY
```

### Architectural approach

Start with a **modular monolith**, not microservices. Keep one API
deployment and separate domain modules. Run background jobs as a
separate process from the same codebase. This keeps the first release
simpler to develop and operate while preserving boundaries for future
scaling.

## 4. The three interfaces

### 4.1 Customer website

Core routes:

-   `/` --- published movies and featured content.
-   `/movies/:slug` --- movie details and available showtimes.
-   `/shows/:showId/seats` --- auditorium seat selection.
-   `/checkout` --- contact details, fee breakdown, and payment.
-   `/booking/:reference` --- booking confirmation.
-   `/my-tickets` --- upcoming, past, cancelled, and refunded bookings.
-   `/account` --- profile and authentication settings.

Features:

-   Display only movies and shows that are published and bookable.
-   Show the exact saved auditorium seat geometry.
-   Show seat category, price, current state, and accessible labels.
-   Request temporary seat holds from the API.
-   Display hold expiry and recover gracefully if a hold expires.
-   Calculate displayed totals using server-returned price data; the
    server recalculates and validates all totals.
-   Permit customer account login and optionally guest checkout.
-   Show tickets from the database even if email delivery fails.
-   Provide cancellation/resend actions only where policy permits.

### 4.2 Admin panel

Core routes:

-   `/admin` --- dashboard.
-   `/admin/movies` --- movie CRUD, publish/unpublish, metadata, and
    media.
-   `/admin/theatres` --- theatre configuration.
-   `/admin/auditoriums` --- auditorium list and layout import/editor.
-   `/admin/shows` --- schedule and show pricing.
-   `/admin/bookings` --- search and booking details.
-   `/admin/payments` --- payment reconciliation and refunds.
-   `/admin/staff` --- staff accounts and permissions.
-   `/admin/reports` --- sales, occupancy, and exports.
-   `/admin/settings` --- policy and system settings.

Features:

-   Upload movie title, poster, thumbnail, banner, synopsis, language,
    genre, duration, certification, release date, and trailer URL.
-   Create shows with theatre, auditorium, date, start time,
    duration/end time, booking window, and prices.
-   Prevent conflicting screenings in the same auditorium.
-   Import and approve seat layouts.
-   Block seats for maintenance or operational needs.
-   Review bookings and payment status.
-   Initiate permitted cancellations and refunds through auditable
    workflows.
-   Review scan history and operational reports.
-   Never expose admin APIs to users who merely hide or lack an admin UI
    route; enforce permissions on the backend for every request.

### 4.3 Staff ticket scanner

The scanner is a **separate role-protected interface**, not part of the
customer account and not an admin dashboard with unrestricted access.

Core routes:

-   `/staff/login` --- staff authentication.
-   `/staff/scanner` --- camera scanner.
-   `/staff/scan-result/:id` --- result details if a result page is
    needed.
-   `/staff/scan-history` --- limited history for authorised staff or
    supervisors.

Features:

-   Scan a ticket QR using a supported phone camera over HTTPS.
-   Also allow manual booking/ticket reference lookup for authorised
    staff if policy permits.
-   Validate the ticket with the backend; never decide admission from QR
    contents alone.
-   Display clear results:
    -   **VALID / ENTRY ACCEPTED** --- ticket is eligible and has not
        been checked in.
    -   **ALREADY USED** --- show prior check-in time only to authorised
        staff.
    -   **INVALID** --- unknown token, unpaid booking,
        cancelled/refunded ticket, wrong show, or other rejection.
    -   **RETRY / SERVICE UNAVAILABLE** --- do not admit automatically
        when the server cannot verify the ticket.
-   Record staff ID, show, ticket, scan timestamp, result, and rejection
    reason.
-   Support multiple authorised scanners concurrently.
-   Restrict staff to assigned theatres/shows where appropriate.
-   Do not store customer-sensitive data in the QR payload.

#### Ticket granularity decision

Recommended default: issue a unique ticket and QR token **per admitted
person/seat**, grouped under one booking reference. This permits partial
entry and prevents the same seat ticket from being used twice. If the
business explicitly wants one QR for an entire group, implement a
separate group-admission action that atomically checks in all eligible
tickets; do not mix the two semantics.

## 5. Domain modules

1.  **Authentication and authorization** --- users, roles, sessions,
    guest access, password reset, rate limits.
2.  **Movie catalogue** --- movie metadata, media, publication status,
    search.
3.  **Theatre and auditorium** --- theatres, screens, layout versions,
    seats, seat categories.
4.  **Show scheduling** --- show dates/times, duration, conflicts,
    booking window and prices.
5.  **Seat inventory** --- show-specific seat states, holds, expiration,
    blocking.
6.  **Bookings** --- price snapshots, booking state transitions,
    customer ownership.
7.  **Payments** --- order creation, verified callbacks, idempotency,
    refunds, reconciliation.
8.  **Tickets** --- ticket issuance, QR tokens, cancellation state,
    check-in.
9.  **Notifications** --- email templates, outbox, retries and delivery
    records.
10. **Reporting and audit** --- occupancy, revenue, staff actions,
    exports and event history.

Each module should have its own route/controller, validation schemas,
service/business logic, and data-access layer. Controllers should remain
thin. Do not place core booking logic in React or duplicate it across
API routes.

## 6. Proposed database schema

The following is the logical schema; exact types, indexes, and migration
files must be finalized during implementation.

### 6.1 Identity and access

-   `users`
    -   `id`, `email`, `mobile`, `password_hash`, `display_name`,
        `status`, `created_at`, `updated_at`
-   `roles`
    -   `id`, `name`
-   `user_roles`
    -   `user_id`, `role_id`
-   `sessions` (if server-side sessions are used)
    -   `id`, `user_id`, hashed session identifier, expiry, revocation
        timestamps
-   `guest_customers` (if guest checkout is enabled)
    -   `id`, `email`, `mobile`, consent/retention fields as required

Do not permit public self-registration to grant administrator or scanner
roles.

### 6.2 Movies and media

-   `movies`
    -   `id`, `slug`, `title`, `synopsis`, `duration_minutes`,
        `language`, `genre`, `certification`, `release_date`, `status`,
        timestamps
-   `movie_media`
    -   `id`, `movie_id`, `media_type`, `storage_key/url`, `alt_text`,
        display order
-   `theatres`
    -   `id`, `name`, `address`, `timezone`, `status`
-   `auditoriums`
    -   `id`, `theatre_id`, `name`, `status`, active layout version
-   `seat_categories`
    -   `id`, `name`, description, default configuration
-   `seat_layout_versions`
    -   `id`, `auditorium_id`, `version`, source file metadata/hash,
        import status, approval metadata
-   `seats`
    -   `id`, `auditorium_id`, `layout_version_id`, stable seat key, row
        label, seat label/number, x/y or grid coordinates, category ID,
        seat type/status, accessibility attributes

Seat geometry must be data-driven. Model aisle gaps and non-seat
positions explicitly when needed, or derive empty spaces from
coordinates. Do not invent seat positions by evenly filling a row.

### 6.3 Shows and seat inventory

-   `shows`
    -   `id`, `movie_id`, `auditorium_id`, `starts_at`, `ends_at`,
        `booking_opens_at`, `booking_closes_at`, `status`, timestamps
-   `show_seats`
    -   `id`, `show_id`, `seat_id`, `status`, current hold reference,
        booking reference, price snapshot, timestamps
-   `show_seat_prices`
    -   `id`, `show_id`, category/seat reference, amount in minor
        currency units, currency
-   `seat_holds`
    -   `id`, `show_id`, owner/session reference, status, expires_at,
        created_at, released_at
-   `seat_hold_items`
    -   `hold_id`, `show_seat_id`
-   `blocked_seats`
    -   `id`, `show_seat_id`, reason, created_by, created_at

Enforce a unique constraint on `(show_id, seat_id)` in `show_seats`. A
physical seat can be sold in different shows, but it can have only one
active allocation for a specific show.

### 6.4 Booking and payment

-   `bookings`
    -   `id`, unique `booking_reference`, customer/user or guest
        reference, `show_id`, status, subtotal, fees, tax, total,
        currency, contact snapshot, timestamps
-   `booking_seats`
    -   `id`, `booking_id`, `show_seat_id`, seat label/category/price
        snapshot
-   `payments`
    -   `id`, `booking_id`, provider, unique provider order/payment
        reference where applicable, amount, currency, status,
        verified_at, timestamps
-   `payment_events`
    -   `id`, provider event ID (unique where available), event type,
        payload hash/minimal safe metadata, processing status,
        received/processed timestamps
-   `refunds`
    -   `id`, `payment_id`, amount, reason, provider refund reference,
        status, initiated_by, timestamps
-   `tickets`
    -   `id`, booking ID, booking-seat ID, unique ticket reference,
        hashed/opaque QR token, status, checked_in_at, checked_in_by
-   `ticket_scans`
    -   `id`, ticket ID/token lookup, show ID, staff ID, result,
        rejection reason, scanned_at, device/request metadata as
        appropriate
-   `email_outbox`
    -   `id`, event type, recipient reference, template data, status,
        attempt count, next_attempt_at, provider message ID, timestamps
-   `audit_logs`
    -   `id`, actor ID, action, entity type/ID, safe before/after
        metadata, request ID, timestamp

Use foreign keys and appropriate check constraints. Store currency
amounts as integer minor units where practical (for example, paise for
INR). Store event timestamps in UTC; render times in the theatre's
configured timezone.

## 7. Excel auditorium layout import

The supplied `PVR SANGAM AUDI LAYOUT.xlsx` is the reference source for
physical layout. The workbook reportedly lists four auditoriums and
capacity totals of 265, 221, 330, and 301 respectively (1,117 total
listed seats); verify these figures and the detailed
positions/categories against the actual workbook during import rather
than assuming they are correct.

Import workflow:

1.  Read every auditorium sheet and preserve its original sheet name.
2.  Map cells/labels to explicit row, seat number, coordinate, category,
    and any aisle/empty position.
3.  Normalize category labels without losing original source values.
4.  Validate duplicate seat identifiers, missing labels, invalid
    positions, category counts, and total capacity.
5.  Generate an import report with errors and warnings.
6.  Render a preview using the same seat-map component used by
    customers.
7.  Require an authorised admin to approve the layout.
8.  Save the approved version and source file metadata/hash.
9.  Create show inventory from the approved layout when a show is
    scheduled.
10. Do not silently mutate layouts for shows with existing bookings.

Do not guess the exact physical coordinates from capacity totals alone.
A layout must be visually checked against the source workbook before
being made bookable.

## 8. Seat state and booking concurrency

Conceptual state flow:

``` mermaid
stateDiagram-v2
    [*] --> AVAILABLE
    AVAILABLE --> HELD: Hold created transactionally
    HELD --> AVAILABLE: Hold expires or is released
    HELD --> BOOKED: Payment verified and booking committed
    AVAILABLE --> BLOCKED: Admin blocks seat
    BLOCKED --> AVAILABLE: Admin unblocks seat
    BOOKED --> CANCELLED: Permitted cancellation workflow
    CANCELLED --> AVAILABLE: Only when release policy allows
```

Use explicit state transitions and ensure the database is the final
authority.

### Hold algorithm

1.  Client submits show ID and selected seat IDs.
2.  Server validates show status, booking window, seat membership,
    limits, and price.
3.  Begin a short PostgreSQL transaction.
4.  Lock the relevant `show_seats` rows in a consistent order, or use
    conditional updates with verified affected-row counts.
5.  Confirm every requested seat is available or has an expired hold
    that can safely be reclaimed.
6.  If any seat cannot be held, roll back the entire selection; never
    partially hold it.
7.  Create a hold and expiry timestamp, and link all seats to it.
8.  Commit and return hold ID, expiration, and server-calculated price
    summary.

Do not keep database transactions open while the customer interacts with
the payment provider.

### Concurrency invariants

-   One inventory row per show and physical seat.
-   No two active holds/bookings can own the same show-seat.
-   Multi-seat holds succeed or fail as one operation.
-   Lock seats in stable sorted order to reduce deadlocks.
-   A hold expiry worker cleans up abandoned holds, but correctness must
    not depend on it running at an exact time.
-   Availability reads must treat expired holds as reclaimable only
    through a safe transactional path.
-   The same booking or payment callback cannot be processed twice to
    create duplicate effects.

## 9. Payment-to-booking workflow

Recommended high-level flow:

1.  Create temporary seat hold.
2.  Create a pending booking with immutable price snapshots.
3.  Backend creates a payment order with the provider using the
    server-calculated amount.
4.  Customer completes hosted/approved checkout.
5.  Backend verifies provider signatures and transaction state; a
    browser redirect is not proof of payment.
6.  Record payment event idempotently.
7.  In a short transaction, recheck inventory/hold and transition the
    booking and seats to confirmed/booked.
8.  Create ticket records and a transactional email-outbox record.
9.  Return confirmation to the customer when the committed state is
    known.
10. Reconcile unknown outcomes and delayed callbacks with provider
    APIs/jobs.

Failure cases to implement and test:

-   Declined payment.
-   Customer closes checkout.
-   Payment succeeds but browser redirect is lost.
-   Duplicate webhook delivery.
-   Webhook arrives before frontend callback.
-   Provider timeout with unknown outcome.
-   Payment succeeds after the hold expired.
-   Refund or cancellation after booking.
-   Worker or API crashes between processing steps.

If a payment succeeds after the seat hold has expired and the seats have
been sold to someone else, do not double-book. Use a documented recovery
workflow: reacquire the seats only if they remain available, otherwise
mark the payment for refund/manual resolution and notify the customer.

Use provider event IDs and payment references for idempotency. Do not
store card numbers or CVVs.

## 10. Ticket generation and scanning

### QR payload

The QR should contain an opaque random ticket token or a
cryptographically signed ticket reference. It must not contain private
customer data. Store only a hash of a high-entropy opaque token when the
chosen design allows hash-based lookup.

### Validation algorithm

1.  Staff scans QR in the staff interface.
2.  UI sends token and intended show/entry context to the backend over
    HTTPS.
3.  Backend authenticates staff and checks theatre/show permissions.
4.  Backend resolves the ticket and verifies:
    -   token is valid and not revoked;
    -   booking is confirmed and payment is verified;
    -   ticket has not been cancelled/refunded;
    -   show and ticket are valid for the current entry context;
    -   ticket has not already been checked in.
5.  Backend atomically marks the ticket checked in, conditioned on it
    still being valid and unused.
6.  Only the request that successfully performs the state transition
    returns **ENTRY ACCEPTED**.
7.  Concurrent scans of the same ticket must result in one acceptance
    and subsequent **ALREADY USED** responses.
8.  Record the scan result and audit data.

Do not admit automatically when the scanner is offline or the backend
cannot verify the ticket. If offline entry is required, design a
separate signed/offline protocol with explicit replay and reconciliation
controls; do not simulate it with a local green result.

### Staff permissions

-   `SCANNER`: scan/validate tickets for assigned shows or theatres.
-   `SUPERVISOR`: scanner permissions plus limited scan
    history/overrides if explicitly allowed.
-   `ADMIN`: configuration and operational management.
-   `CUSTOMER`: own bookings and tickets only.

Any override, manual admission, or ticket correction must require
explicit permission and be audited.

## 11. Email and notification reliability

Use a transactional outbox:

1.  Booking/ticket transaction commits and inserts an outbox event in
    the same database transaction.
2.  Worker claims pending messages safely.
3.  Worker sends using the configured email provider.
4.  Store provider message ID and delivery status when available.
5.  Retry transient failures with exponential backoff and a maximum
    attempt policy.
6.  Surface permanently failed messages for support/admin review.
7.  Resend requests must not create another booking or ticket.

The My Tickets page must work independently of email delivery. Include
movie, show, auditorium, seat labels, booking reference, ticket
references, and QR tickets in the email as appropriate.

## 12. API routes

Prefix APIs with `/api/v1`. These are proposed contracts, not
implemented endpoints.

### Public/customer

  Method   Route                               Purpose
  -------- ----------------------------------- -------------------------------------
  GET      `/movies`                           List published movies
  GET      `/movies/:movieId`                  Movie details
  GET      `/shows`                            Search showtimes
  GET      `/shows/:showId/seats`              Layout and availability
  POST     `/seat-holds`                       Create transactional hold
  DELETE   `/seat-holds/:holdId`               Release owned hold
  POST     `/bookings`                         Create pending booking against hold
  POST     `/payments/orders`                  Initiate payment
  GET      `/bookings/:reference`              Authorised booking lookup
  GET      `/me/tickets`                       Current customer's tickets
  GET      `/tickets/:ticketId`                Authorised ticket details
  POST     `/tickets/:ticketId/resend-email`   Queue email resend

### Admin

  ----------------------------------------------------------------------------------------------------
  Method                  Route                                                Purpose
  ----------------------- ---------------------------------------------------- -----------------------
  POST                    `/admin/movies`                                      Create movie

  PATCH                   `/admin/movies/:id`                                  Update movie

  POST                    `/admin/media/upload-url`                            Generate restricted
                                                                               upload URL

  POST                    `/admin/theatres`                                    Create theatre

  POST                    `/admin/auditoriums`                                 Create auditorium

  POST                    `/admin/auditoriums/:id/layout-imports`              Start layout import

  POST                    `/admin/auditoriums/:id/layouts/:version/activate`   Activate approved
                                                                               layout

  POST                    `/admin/shows`                                       Schedule show

  PATCH                   `/admin/shows/:id`                                   Modify show subject to
                                                                               booking restrictions

  GET                     `/admin/bookings`                                    Search bookings

  POST                    `/admin/bookings/:id/cancel`                         Authorised cancellation

  POST                    `/admin/refunds`                                     Initiate refund

  GET                     `/admin/reports/occupancy`                           Occupancy report

  GET                     `/admin/reports/revenue`                             Revenue report
  ----------------------------------------------------------------------------------------------------

### Staff and provider integrations

  --------------------------------------------------------------------------------
  Method                  Route                            Purpose
  ----------------------- -------------------------------- -----------------------
  POST                    `/staff/tickets/validate`        Validate QR and attempt
                                                           atomic check-in

  GET                     `/staff/scan-history`            Restricted scan history

  POST                    `/webhooks/payments/:provider`   Verify and process
                                                           provider events
  --------------------------------------------------------------------------------

Validate request bodies with Zod or an equivalent schema library. Use
consistent error envelopes, request IDs, rate limits, structured
logging, and safe error messages. Do not return raw SQL errors or
secrets.

## 13. Frontend and repository layout

``` text
movie-ticket-booking/
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── app/
│   │       ├── components/
│   │       ├── features/
│   │       │   ├── movies/
│   │       │   ├── shows/
│   │       │   ├── seat-selection/
│   │       │   ├── checkout/
│   │       │   ├── my-tickets/
│   │       │   ├── admin/
│   │       │   └── staff-scanner/
│   │       ├── hooks/
│   │       ├── services/
│   │       └── routes/
│   └── api/
│       └── src/
│           ├── config/
│           ├── middleware/
│           ├── modules/
│           │   ├── auth/
│           │   ├── movies/
│           │   ├── theatres/
│           │   ├── auditoriums/
│           │   ├── shows/
│           │   ├── inventory/
│           │   ├── bookings/
│           │   ├── payments/
│           │   ├── tickets/
│           │   ├── notifications/
│           │   └── reports/
│           ├── jobs/
│           ├── integrations/
│           ├── db/
│           └── app.js
├── packages/
│   └── shared/
│       ├── schemas/
│       ├── types/
│       └── constants/
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── importers/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── load/
├── docs/
│   ├── architecture.md
│   ├── database.md
│   ├── api.md
│   └── deployment.md
├── .env.example
├── package.json
└── README.md
```

Use a lockfile and deterministic builds. Share validation schemas where
appropriate, but never bundle server secrets or backend-only code into
the browser application.

## 14. Security requirements

-   Enforce role-based access on every protected API endpoint.
-   Use secure password hashing and account recovery.
-   Use HTTPS in production.
-   If cookie-based sessions are used, use secure, HttpOnly,
    appropriately SameSite cookies and CSRF protections where needed.
-   Protect login, checkout, hold creation, QR validation, and resend
    endpoints with appropriate rate limits.
-   Validate file type, content, size, and upload permissions.
-   Use server-calculated amounts and verified payment events.
-   Use unpredictable ticket tokens and atomic check-in.
-   Ensure customers can access only their own bookings/tickets.
-   Keep secrets in environment-specific secret storage, never Git.
-   Restrict database network access and permissions.
-   Use backups and periodically test restore procedures.
-   Maintain an auditable record of admin, payment, refund, and
    ticket-scan actions.
-   Define retention and privacy policies for customer data, email logs,
    scan history, and payment records.

## 15. Deployment and environments

Maintain:

-   **Development:** local app, local/test database, payment sandbox.
-   **Staging:** production-like infrastructure and test payment/email
    settings.
-   **Production:** live database, live provider credentials,
    monitoring, backups, and a supervised worker.

Recommended deployment topology:

-   Static React build hosted behind HTTPS/CDN.
-   Node API on a persistent or suitably managed application host.
-   Separate worker process using the same backend codebase.
-   PostgreSQL managed service or a properly maintained server.
-   Object storage for posters and banners.
-   Payment and email provider integrations.

Do not expose PostgreSQL publicly. Use connection pooling and monitor
connection counts, slow queries, locks, error rates, and worker backlog.

### CI/CD

1.  Push to GitHub.
2.  CI runs linting, type checks, unit tests, integration tests, and
    production builds.
3.  Deploy to staging.
4.  Run migration and end-to-end smoke tests.
5.  Obtain required production approval.
6.  Deploy application and backward-compatible migrations.
7.  Check health metrics and rollback safely if needed.

Never run destructive migrations automatically without review and a
recovery plan. Application and schema versions must remain compatible
during rollout.

## 16. Testing strategy

### Critical booking tests

-   Two or more clients request the same seat simultaneously; exactly
    one can hold it.
-   A multi-seat request fails atomically if any seat is unavailable.
-   Expired holds are reclaimed safely.
-   Duplicate payment callbacks do not create duplicate bookings or
    tickets.
-   A successful payment with a lost browser redirect is reconciled.
-   A late payment after hold expiry cannot double-book.
-   Cancellation/refund transitions follow policy and do not silently
    reopen seats.
-   Price changes after booking do not alter the existing booking's
    price snapshot.

### Critical scanner tests

-   Valid, paid, unused ticket is accepted once.
-   Cancelled, refunded, unpaid, unknown, and wrong-show tickets are
    rejected.
-   Repeated scans return already-used.
-   Concurrent scans of one ticket yield only one successful check-in.
-   Staff cannot scan shows outside their permission scope.
-   Scanner API outage never results in automatic admission.
-   QR token does not reveal private customer data.
-   Every scan attempt is recorded according to the logging policy.

### Other tests

-   Excel import validation and visual layout comparison.
-   Show scheduling conflict checks.
-   Customer ownership and admin authorization.
-   Email retry and duplicate-send handling.
-   Database backup restore.
-   Load tests for seat availability, holds, checkout, and scanning.

## 17. Monitoring and operational targets

Initial targets to validate under load---not performance guarantees:

-   Movie/show listing API p95 below 500 ms under expected load.
-   Seat availability and hold API p95 below 500 ms under expected load.
-   Zero duplicate confirmed seat allocations.
-   Idempotent payment event processing.
-   Measured email delivery and retry backlog.
-   Monitoring for API error rate, payment reconciliation backlog,
    expired holds, database connections/locks, worker health, and ticket
    scan latency.

Do not claim a traffic capacity until load testing is completed on the
chosen deployment configuration.

## 18. Implementation roadmap

### Phase 1 --- Foundation

Set up repository, React/Vite, Express, PostgreSQL, migrations,
configuration, shared schemas, and CI.

### Phase 2 --- Admin and auditorium setup

Build authentication and roles, movie CRUD, media upload, Excel layout
importer, visual seat-map preview, validation report, and layout
approval.

### Phase 3 --- Show scheduling and inventory

Build theatre/auditorium management, show scheduling, conflict
detection, category pricing, per-show inventory, transactional seat
holds, and expiry.

### Phase 4 --- Booking and payments

Build checkout, pending bookings, provider integration, webhook
verification, idempotency, failure handling, refunds, and
reconciliation.

### Phase 5 --- Tickets, scanner, and email

Build My Tickets, per-seat QR tickets, staff login, camera scanning,
atomic check-in, scan history, email outbox, retries, and resend.

### Phase 6 --- Reporting and production launch

Build reports, audit views, security testing, concurrent booking tests,
load testing, backup restore, monitoring, and production deployment.

## 19. Definition of done

-   [ ] Admin can create and publish a movie.
-   [ ] Admin can import, preview, validate, and approve the real
    auditorium layouts.
-   [ ] Shows can be scheduled without auditorium conflicts.
-   [ ] Customer sees the actual seat positions and categories.
-   [ ] Concurrent requests cannot book the same seat twice.
-   [ ] Expired holds release seats safely.
-   [ ] Only verified payment can result in a paid booking.
-   [ ] Payment callbacks are idempotent and reconciled.
-   [ ] My Tickets displays only the authorised customer's tickets.
-   [ ] Email delivery can fail and retry without losing the booking.
-   [ ] Scanner staff can scan a ticket and receive a backend-verified
    result.
-   [ ] A ticket can be checked in only once, including concurrent
    scans.
-   [ ] Cancelled/refunded/unpaid/wrong-show tickets are rejected.
-   [ ] Staff permissions are enforced server-side.
-   [ ] Reports reconcile with bookings, payments, and refunds.
-   [ ] Backups, restore procedures, monitoring, and deployment rollback
    are tested.

## 20. Important decisions before implementation

Confirm these business choices before production configuration:

1.  Single theatre (PVR Sangam with four auditoriums) or multiple
    theatres.
2.  Online payment only, or online plus counter bookings.
3.  Customer login required or guest checkout allowed.
4.  Per-seat QR tickets (recommended) or one group QR that admits an
    entire booking.
5.  Cancellation/refund rules and whether refunded seats become
    available again.
6.  Ticket hold duration and maximum seats per booking.
7.  Exact hosting provider and payment/email providers.

Until confirmed, implement these as configuration or explicit policy
decisions rather than embedding assumptions throughout the code.

------------------------------------------------------------------------

**Implementation instruction:** Treat this document as the architecture
baseline. Before building screens, create the database migrations and
state-transition rules. Then implement the auditorium import and
preview, followed by transactional seat inventory, payment
reconciliation, ticket issuance, and staff scanning. Do not substitute
mock seat availability or frontend-only ticket validation for the
production workflows described here.
