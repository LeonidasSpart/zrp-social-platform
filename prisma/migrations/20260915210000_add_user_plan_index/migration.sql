-- Admin Subscriptions & Billing dashboard now filters and counts users by
-- User.plan directly (a legacy-paid user may have no Subscription row yet -
-- see docs/subscriptions.md "Existing users"), so this needs its own index
-- rather than relying on the existing unique indexes on email/username.
CREATE INDEX "User_plan_idx" ON "User"("plan");
