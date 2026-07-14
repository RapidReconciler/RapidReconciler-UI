# VALC — Java 25 LTS upgrade (Spring Boot 4.0 migration)

**Status:** documented / not started (owner 2026-07-14). **Target repo:** `RapidReconciler-Valc`.
**WORKLIST:** VLC-16.

## Requirement

Move VALC from **Java 21 → Java 25 LTS** (Sept 2025 release, the current LTS).

## The gate — this is a Spring Boot upgrade, not a Java flag flip

VALC today: **Java 21 · Spring Boot 3.3.5 · Lombok 1.18.38**, with SAML / Entra / OIDC
as separate compile source trees (build-helper `3.6.0`) and **opensaml 4.3.2** pulled
from the Shibboleth repo under the `-Psaml` profile.

Boot 3.3.5 predates Java 25 — its bundled bytecode libraries (ASM / CGLIB) can't
process Java 25's class-file format and it will fail at startup. So Java 25 **forces a
Spring Boot bump**, and that bump is ~90% of the work.

- **Boot 3.5.5+** is Java-25-ready but **3.5 hit OSS end-of-life 2026-06-30** — a dead
  end (no security patches). Only a throwaway stepping stone.
- **Boot 4.0.x** — first-class Java 25 support, actively maintained, Java 17 baseline
  kept. **This is the target.** It pulls **Spring Framework 7 + Spring Security 7**,
  which is a real code migration for VALC's three auth trees + opensaml.

## Work items (dependency order)

1. **JDK 25 (Temurin)** on the dev box (build + runtime) and the self-hosted GHA runner; set `JAVA_HOME`.
2. **`pom.xml`:**
   - `<java.version>` `21 → 25`.
   - `spring-boot-starter-parent` `3.3.5 → 4.0.x`.
   - **Lombok** `1.18.38 →` latest (JDK-version-gated annotation processing — the classic
     silent blocker on a new JDK; confirm the release that lists Java 25).
   - Re-check pinned deps against Security 7 / Java 25: `jjwt 0.12.6`, `bouncycastle 1.78.1`,
     and the **`-Psaml` profile** (spring-security-saml2 + opensaml 4.3.2 / Shibboleth) —
     Security 7 changes the saml2 module and the opensaml version.
   - Confirm the Maven compiler plugin handles `release 25`.
3. **Spring Security 7 code migration** — `src/saml`, `src/entra`, `src/oidc` (auth
   filters/config) + general Boot 4 config-property renames and removed deprecations.
   **This is the bulk and the risk.**
4. **CI:** `.github/workflows/release.yml` `setup-java` `21 → 25` (temurin).
5. **Runtime:** point the dev launcher / `java -jar` at JDK 25; update the deployment JRE
   if VALC ships one.
6. **`rr-common`** (shared Bitbucket lib): its Java-21 bytecode *runs* on JDK 25 (backward
   compatible) — no recompile needed unless it touches removed APIs. Leave it unless it breaks.
7. **Test:** full rebuild on JDK 25, then smoke-test **all three auth flows live**
   (SAML / Entra / OIDC — most exposed to Security 7) plus the SSIS/DB deploy and broker paths.

## Broker / agent (freeze lifted 2026-07-14)

The **broker** (`rr-valc-agent.jar`) was frozen through the cutover — no longer. Owner
2026-07-14: every new customer and every upgrade takes a **clean agent install**, so
there's no in-place-upgrade constraint left to protect. We're now free to improve the
broker, including bumping **its** Java/runtime to match, or reworking the broker protocol,
if the upgrade wants it. See memory [[feedback_data_services_changeable_broker_frozen]]
(updated). The **Agent (Data Services) repo** is on the same Boot/Java baseline and will
want the identical treatment — plan them together.

## Effort + division of labor

The `<java.version>` flip is five minutes. The **Boot 4 / Security 7 auth migration is
days** and needs live auth testing the owner drives (rebuild VALC, exercise SSO). Claude
can do the mechanical layer autonomously — pom/CI edits, dependency bumps, first-pass
Security 7 code changes — and surface the compile breaks as a punch list; the SAML/opensaml
profile and live auth verification are owner-coordinated.

## Open decisions
- Confirm **Boot 4.0.x** as the target (vs a 3.5 stepping stone — not recommended, EOL).
- Whether to upgrade the **broker + Agent (Data Services)** Java in the same pass (now
  unblocked) or sequence VALC first.

## Sources
- Spring Boot System Requirements — https://docs.spring.io/spring-boot/system-requirements.html
- spring-boot #47245 "Document Java 25 support" — https://github.com/spring-projects/spring-boot/issues/47245
