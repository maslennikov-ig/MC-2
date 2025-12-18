# ADR-001: Choice of Open edX as Primary LMS

**Status:** Accepted
**Date:** 2025-11-30
**Authors:** MegaCampusAI Team
**Deciders:** Product Owner, Lead Architect
**Consulted:** DevOps Team, Legal Counsel (RU/Intl)

---

## Context and Problem Statement

MegaCampusAI is building a SaaS Learning Management System (LMS) with a core value proposition of **AI-powered automated course generation**. We need a robust, scalable, and compliant LMS engine to serve as the backend for course delivery in two distinct geopolitical jurisdictions: **Russia** and **International (Dubai/EU)**.

**Key Constraints:**

1. **Data Sovereignty (Russia):**
    * **152-FZ:** Personal data of Russian citizens must be stored physically in Russia.
    * **149-FZ (Hosting Provider Law):** As of Feb 1, 2024 (tightened Sep 1, 2025), any entity providing hosting capacity must be registered in the Roskomnadzor "Hosting Provider Registry".
    * **SORM (FSB Surveillance):** Hosting infrastructure must have SORM hardware installed to allow FSB access to user metadata (Law 374-FZ "Yarovaya").
    * **Sanctions Resilience:** Protection against service denial by Western vendors due to geopolitical sanctions.

2. **Data Sovereignty (International - Dubai/EU):**
    * **GDPR (EU):** Strict requirement to process European user data within the EEA or countries with "Adequacy Decisions". Transferring data to Russia is strictly prohibited.
    * **UAE Personal Data Protection Law (PDPL):** Requires consent and imposes restrictions on cross-border transfers, mirroring GDPR principles.
    * **US Sanctions (OFAC):** Strict prohibition on exporting dual-use technology or services to sanctioned Russian entities/individuals.

3. **Architecture:** "Satellite Architecture" (Private AI Core + Commodity LMS Backend).
4. **Timeline:** MVP Launch March 6, 2026 (Dubai Summit).
5. **Business Model:** B2B/B2C SaaS requiring multi-tenancy, commerce, and whitelabeling.

## Decision Drivers

* **Compliance Viability:** Can the platform run legally in both Russia (surveillance mandate) and EU (privacy mandate) simultaneously?
* **Integration:** Ease of automated course generation (API vs. File Import).
* **Commerce Features:** Native support for course catalogs, payments, and B2C workflows.
* **SaaS Readiness:** Multi-tenancy support and scalability.
* **Vendor Independence:** Risk of vendor lock-in or politically motivated service termination.

## Considered Options

### Option 1: Canvas LMS (Open Source)

* **Pros:**
  * Deeply established in academic markets.
  * Strong LTI support.
* **Cons:**
  * **Chatty API:** Course generation requires hundreds of recursive REST API calls. High latency and error-prone.
  * **No Commerce:** OSS version lacks a storefront/catalog. We would need to build a custom e-commerce frontend.
  * **Compliance Risk:** Maintained by a US company. Security patches or access could be restricted for Russian IPs.
  * **Multi-tenancy:** Complex to configure custom domains for root accounts in the OSS version.

### Option 2: Open edX (via Tutor)

* **Pros**:
  * **Atomic Import (OLX):** Fast course generation via single file upload.
  * **Native Commerce:** Built-in Course Catalog and enrollment flows.
  * **Self-Hosted Sovereignty:** Full control over the database and code.
  * **SaaS Ecosystem:** Proven ecosystem (`eox-tenant`) for handling multi-tenancy and whitelabeling.
  * **Multi-Region Ready:** Tutor architecture supports deploying identical but physically isolated stacks ("Twin Towers" model).
* **Cons**:
  * **High Complexity:** The architecture is a sprawling set of microservices (LMS, CMS, Discovery, Credentials) requiring significant DevOps maturity to manage.
  * **Resource Intensive:** Requires a much heavier server footprint (min 8GB RAM) compared to lighter alternatives.
  * **Frontend Rigidity:** While "Theming" (colors/logos) is easy, changing the actual layout or user experience requires forking Micro-Frontends (MFEs), which is technically difficult and introduces maintenance debt.
  * **Documentation Fragmentation:** Official documentation is often split between the Open edX community, the Tutor community, and commercial vendors, making troubleshooting slower.

## Decision Outcome

We choose **Option 2: Open edX** as the core LMS engine.

### Justification

1. **Legal Indemnification (The "Twin Towers" Strategy):**
    * **Russia Stack:** Self-hosted on **Yandex Cloud/Selectel** (Roskomnadzor-registered providers with SORM). This meets FZ-152, FZ-149, and Yarovaya Law requirements.
    * **International Stack:** Self-hosted on **AWS Frankfurt/Dubai**. This ensures EU data stays in the EU (GDPR) and UAE data stays local (PDPL). No data ever crosses the border.

2. **Integration Efficiency:**
    * The OLX Import API allows our AI agents to generate courses 10x faster than Canvas REST API (single tarball upload vs. hundreds of calls). This ensures data integrity and speed.

3. **Time-to-Market:**
    * Open edX includes a native "Storefront" out of the box. We save ~3 months of development by not building a custom e-commerce application for the March 2026 launch.

4. **Sanctions & Censorship Resistance:**
    * Open edX is open-source. It cannot be "turned off" by sanctions. Self-hosting protects us from sudden "Cloud Bans" by foreign vendors.

## Implementation Plan

### 1. Deployment Strategy (IaC)

* **Tooling:** Use **Tutor** as the standard deployment tool wrapper.
* **Infrastructure as Code:** Manage both environments via Terraform/Ansible from a single private repository with region-specific configuration files.

### 2. Dual-Stack Isolation

* **RU-Stack (Yandex Cloud - Moscow):**
  * *DNS:* `*.megacampus.ru`
  * *Auth:* Keycloak (Local) or Russian OAuth.
  * *Logs:* Retained for 1 year (Yarovaya Law) in Cold Storage.
  * *Payment:* Mir/SberPay integration.
* **Intl-Stack (AWS - Frankfurt/Dubai):**
  * *DNS:* `*.megacampus.io`
  * *Auth:* Auth0 or AWS Cognito.
  * *Compliance:* GDPR Delete requests, Cookie consent (OneTrust).
  * *Payment:* Stripe integration.

### 3. Integration Development

* **Service:** Build a "MegaCampus Adapter" service to convert AI JSON to OLX format.
* **Pattern:** Push Model via REST API (`/api/courses/v0/import/`).
* **Multi-tenancy:** Install and configure `tutor-contrib-eox-tenant` plugin on both stacks.

### 4. Compliance Verification

* **RU:** Verify hosting provider is listed in Roskomnadzor Registry.
* **Intl:** Implement OFAC screening middleware for B2B clients.

## Consequences

### Positive

* **Legal Safety:** Complete isolation prevents "Toxic Data" mixing (surveillance vs. privacy).
* **Sovereignty:** We own the platform assets and are immune to vendor-led service denial.
* **Development Speed:** We avoid building a custom commerce engine and complex API clients.
* **Scalability:** Tutor and Kubernetes compatibility allow scaling for the 12k user summit.

### Negative

* **Operational Cost:** Running two separate infrastructures increases DevOps overhead (~1.5x cost).
* **Learning Curve:** The team must learn OLX structure and Open edX's microservice architecture.
* **Complexity:** CI/CD pipelines must handle region-specific configurations (e.g., Yandex S3 vs AWS S3).

## References

* [Federal Law 152-FZ (Data Protection)](http://pravo.gov.ru/proxy/ips/?docbody=&nd=102108261)
* [Federal Law 149-FZ (Information Tech)](http://pravo.gov.ru/proxy/ips/?docbody=&nd=102108264)
* [GDPR Official Text](https://gdpr-info.eu/)
* [Open edX Architecture Guide](https://edx.readthedocs.io/projects/edx-developer-guide/en/latest/architecture.html)
* [Tutor Documentation](https://docs.tutor.edly.io/)
