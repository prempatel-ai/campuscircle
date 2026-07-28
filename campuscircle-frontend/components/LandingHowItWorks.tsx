"use client";

import React from "react";

export const LandingHowItWorks: React.FC = () => {
  return (
    <section className="w-full py-12 md:py-16 border-t border-border-muted/50 space-y-8">
      <div className="space-y-2">
        <span className="font-mono text-xs font-bold text-accent uppercase tracking-wider">
          MECHANISM
        </span>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-primary tracking-tight">
          How the platform operates.
        </h2>
      </div>

      <div className="space-y-6 max-w-3xl">
        {/* Step 01 */}
        <div className="space-y-1.5">
          <span className="font-mono text-xs font-bold text-primary/60 uppercase">
            01 / Domain Verification
          </span>
          <p className="font-sans text-sm sm:text-base text-ink/80 leading-relaxed">
            Users authenticate using their official university email address. A verification link confirms active enrollment without storing unhashed identity credentials in public post records.
          </p>
        </div>

        {/* Step 02 */}
        <div className="space-y-1.5">
          <span className="font-mono text-xs font-bold text-primary/60 uppercase">
            02 / Pseudonymous Identity Assignment
          </span>
          <p className="font-sans text-sm sm:text-base text-ink/80 leading-relaxed">
            Every user is assigned a deterministic avatar and handle generated cryptographically. This preserves identity consistency across discussions while keeping real names completely private.
          </p>
        </div>

        {/* Step 03 */}
        <div className="space-y-1.5">
          <span className="font-mono text-xs font-bold text-primary/60 uppercase">
            03 / Cryptographic Tenant Isolation
          </span>
          <p className="font-sans text-sm sm:text-base text-ink/80 leading-relaxed">
            Database queries and community feeds are scoped exclusively to your institution. Users can only view and participate in discussions originating within their own university domain.
          </p>
        </div>
      </div>
    </section>
  );
};
