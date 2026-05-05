# RapidReconciler Password Policy

## Table of Contents

- [Overview](#overview)
- [Password Requirements](#password-requirements)
  - [Character Complexity](#character-complexity)
- [Logging In](#logging-in)
- [Resetting a Password](#resetting-a-password)
- [Administration](#administration)
  - [Assigning a Temporary Password](#assigning-a-temporary-password)
  - [Enabling or Disabling the Password Policy](#enabling-or-disabling-the-password-policy)
  - [Locked or Inaccessible Accounts](#locked-or-inaccessible-accounts)
- [Enabling the Complex Password Policy](#enabling-the-complex-password-policy)
- [Quick Reference](#quick-reference)

---

## Overview

RapidReconciler supports an optional complex password policy that can be enabled by a RapidReconciler administrator. When enabled, all user passwords must conform to the requirements outlined in this document. This policy is designed to protect sensitive financial reconciliation data and align with common enterprise security standards.

---

## Password Requirements

When the complex password policy is enabled, all user passwords must meet the following criteria:

| Requirement | Detail |
|---|---|
| Minimum length | 8 characters |
| Name restriction | Cannot contain the user's account name or parts of their full name exceeding two consecutive characters |
| Password history | Cannot match any of the last 10 passwords |
| Expiry | Must be changed every 90 days |
| Storage & transmission | Must not be displayed, stored, or transmitted in clear text |

### Character Complexity

Passwords must contain characters from at least **three of the following four** categories:

- English uppercase characters (A through Z)
- English lowercase characters (a through z)
- Base 10 digits (0 through 9)
- Non-alphabetic characters (e.g. `!`, `$`, `#`, `%`)

> **Tip:** A strong password example would be `Blue$ky92` -- it contains uppercase, lowercase, a digit, and a special character, and does not resemble a name or a previously used password.

---

## Logging In

When a user attempts to log in, they will be directed to the **Password Reset** screen if either of the following conditions is met:

1. 90 days have elapsed since their last password change.
2. They click the **"Forgot your password?"** link and then follow the reset link sent to their email.

> **Note:** The password reset link sent by email is time-limited. If the link has expired, the user should repeat the **"Forgot your password?"** process to receive a new link. If the issue persists, contact your RapidReconciler administrator.

---

## Resetting a Password

On the Password Reset screen, the new password must conform to the policy outlined above. The **Confirm** button remains disabled until the password meets the 8-character minimum length requirement.

**Common reasons a new password may be rejected:**

- The password is fewer than 8 characters
- The password does not meet the three-category complexity requirement
- The password contains the user's name or account name
- The password matches one of the last 10 previously used passwords

If your password is being rejected and you are unsure why, review the requirements above and try a different combination of characters.

---

## Administration

### Assigning a Temporary Password

The RapidReconciler administrator has the ability to assign a temporary password to a new user. Upon first login, the user will be required to reset the temporary password before gaining access to the application.

> **Best Practice:** When assigning a temporary password, notify the user through a separate communication channel (e.g. phone or a separate email) rather than including the password in the same message as the login instructions. This reduces the risk of unauthorized access.

### Enabling or Disabling the Password Policy

The complex password policy can be enabled or disabled at the application level by the RapidReconciler administrator. When disabled, users are not subject to the complexity, history, or expiry requirements described in this document.

> **Recommendation:** It is strongly recommended to keep the complex password policy enabled in all production environments to protect access to sensitive financial data.

### Locked or Inaccessible Accounts

If a user is unable to log in and cannot complete the password reset process (e.g. they no longer have access to the email address on file), the administrator can assign a new temporary password directly through the User Accounts section in VALC.

---

## Enabling the Complex Password Policy

The complex password policy is enabled at the application level by GSI support. To request activation
for your RapidReconciler environment, send an email to [rrsupport@getgsi.com](mailto:rrsupport@getgsi.com)
with the following information:

- Your company name and RapidReconciler account details
- The name of your RapidReconciler administrator
- Your requested activation date

> **Note:** It is recommended to notify all users in advance before the policy is enabled.
> Existing users will be required to reset their passwords at their next login once the
> policy is active.

---

## Quick Reference

| Scenario | Action |
|---|---|
| Password expired | User is redirected to Password Reset screen automatically |
| Forgot password | Click **"Forgot your password?"** and follow the emailed reset link |
| New user first login | Reset the temporary password assigned by the administrator |
| Password reset link expired | Repeat the **"Forgot your password?"** process |
| Account inaccessible | Contact your RapidReconciler administrator to receive a new temporary password |