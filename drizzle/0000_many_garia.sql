CREATE TYPE "public"."booking_status" AS ENUM('confirmed', 'pending_payment', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."organiser_role" AS ENUM('trainer', 'events_manager', 'admin');--> statement-breakpoint
CREATE TYPE "public"."organiser_status" AS ENUM('pending', 'approved', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'link');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'reported_paid', 'paid');--> statement-breakpoint
CREATE TYPE "public"."session_kind" AS ENUM('training', 'event');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('published', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."session_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"mat_requested" boolean DEFAULT false NOT NULL,
	"payment_method" "payment_method",
	"status" "booking_status" NOT NULL,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"cancel_token" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "bookings_cancelToken_unique" UNIQUE("cancel_token")
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"to_email" text NOT NULL,
	"booking_id" uuid,
	"session_id" uuid,
	"resend_id" text,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"photo_url" text,
	"payment_link" text,
	"role" "organiser_role" NOT NULL,
	"status" "organiser_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organiser_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"duration_minutes" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_weekday_range" CHECK ("series"."weekday" between 0 and 6)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "session_kind" NOT NULL,
	"organiser_id" uuid NOT NULL,
	"series_id" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"location" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"spot_limit" integer NOT NULL,
	"mat_limit" integer DEFAULT 0 NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"accepts_cash" boolean DEFAULT true NOT NULL,
	"accepts_link" boolean DEFAULT false NOT NULL,
	"visibility" "session_visibility" DEFAULT 'public' NOT NULL,
	"private_slug" text,
	"banner_url" text,
	"status" "session_status" DEFAULT 'published' NOT NULL,
	"cancel_cutoff_hours" integer DEFAULT 24 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_privateSlug_unique" UNIQUE("private_slug"),
	CONSTRAINT "sessions_spot_limit_positive" CHECK ("sessions"."spot_limit" > 0),
	CONSTRAINT "sessions_mat_limit_nonneg" CHECK ("sessions"."mat_limit" >= 0),
	CONSTRAINT "sessions_price_nonneg" CHECK ("sessions"."price_cents" >= 0),
	CONSTRAINT "sessions_ends_after_start" CHECK ("sessions"."ends_at" > "sessions"."starts_at"),
	CONSTRAINT "sessions_has_payment_method" CHECK ("sessions"."price_cents" = 0 or "sessions"."accepts_cash" or "sessions"."accepts_link"),
	CONSTRAINT "sessions_private_has_slug" CHECK ("sessions"."visibility" = 'public' or "sessions"."private_slug" is not null)
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_organiser_id_organisers_id_fk" FOREIGN KEY ("organiser_id") REFERENCES "public"."organisers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_organiser_id_organisers_id_fk" FOREIGN KEY ("organiser_id") REFERENCES "public"."organisers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_session_idx" ON "bookings" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "bookings_email_idx" ON "bookings" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_one_active_per_email" ON "bookings" USING btree ("session_id",lower("email")) WHERE "bookings"."status" in ('confirmed', 'pending_payment');--> statement-breakpoint
CREATE INDEX "email_log_booking_idx" ON "email_log" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_email_idx" ON "members" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "organisers_email_idx" ON "organisers" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "otp_codes_email_idx" ON "otp_codes" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "sessions_starts_at_idx" ON "sessions" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "sessions_organiser_idx" ON "sessions" USING btree ("organiser_id");