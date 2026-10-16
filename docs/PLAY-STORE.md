# Raaz VPN on Google Play: everything to fill in

Store version = branch `play-store` (no ads yet, daily free minutes). Official app = `main`.
Files for the store are built by GitHub Actions into the `store-builds` release:

| File | Use |
| --- | --- |
| `raaz-play.aab` | Upload this to Play Console (signed with the upload key) |
| `raaz.apk` | Install on phones directly (friends, quick checks) |

Upload key: `C:\Users\asada\raaz-upload-key\` (keep a backup; password in the README file there).
In Play Console keep **Play App Signing** on (default): Google keeps the app signing key, we only use the upload key.

## 1. Create the app

Play Console → **Create app**

| Field | Value |
| --- | --- |
| App name | Raaz VPN |
| Default language | English (United States) |
| App or game | App |
| Free or paid | Free |
| Declarations | tick both (developer policies, US export laws) |

## 2. Store listing (Grow → Store presence → Main store listing)

**Short description (max 80):**
> Free, private VPN. One tap to connect. Free minutes every day, no sign-up.

**Full description:**
> Raaz VPN keeps your connection private on any Wi-Fi or mobile network.
>
> • One tap to connect, no account and no sign-up
> • Free VPN minutes every day
> • Servers in Singapore, India and Germany, with the fastest picked for you
> • Works where VPNs are blocked: Auto mode switches to a TCP connection that looks like normal web traffic
> • Modern WireGuard® encryption
> • No activity logs: we never record the sites you visit, your DNS queries or your traffic
> • Lightweight and fast
>
> Your free minutes refill every day. Minutes are used only while you are connected.
>
> Privacy policy: https://13-126-168-194.sslip.io/privacy.html
>
> WireGuard is a registered trademark of Jason A. Donenfeld.

| Asset | File |
| --- | --- |
| App icon 512×512 | `android-app/assets/brand/play-icon-512.png` |
| Feature graphic 1024×500 | `android-app/assets/brand/feature-graphic.png` |
| Phone screenshots (2–8, 1080×1920) | `android-app/assets/brand/screenshots/*.png` |

Category: **Tools**. Contact email: the support email. Website: optional.

## 3. App content (Policy → App content)

| Section | Answer |
| --- | --- |
| Privacy policy | https://13-126-168-194.sslip.io/privacy.html |
| App access | All functionality is available without special access (no login) |
| Ads | **No, my app does not contain ads** (this version). Change to Yes in the update that adds ads |
| Content rating | Questionnaire: category "Utility, productivity, communication or other"; answer No to violence, sexual content, profanity, drugs, gambling; "Does the app allow users to interact or exchange content?" No; "Does it share the user's location?" No → expected rating: Everyone / PEGI 3 |
| Target audience | 18 and over (avoids the Families policy; a VPN is not for children) |
| News app | No |
| Government app | No |
| Financial features | None |
| Health | No |
| Data safety | see section 4 |
| VPN declaration (VpnService) | see section 5 |

## 4. Data safety

Does your app collect or share any of the required user data types? **Yes**
Is all collected data encrypted in transit? **Yes**
Do you provide a way for users to request that their data is deleted? **Yes** (by e-mail, with the device ID from Settings)

| Data type | Collected | Shared | Optional? | Purpose |
| --- | --- | --- | --- | --- |
| Device or other IDs (random device ID; one-way hash of the Android ID) | Yes | No | Required | App functionality, Fraud prevention, security and compliance |
| App info and performance → none | No | | | |
| Location, Personal info, Financial, Messages, Photos, Contacts, Web browsing, App activity | No | | | |

Not collected: IP addresses with activity, browsing history, DNS queries, advertising ID.
Data is processed ephemerally where possible (session data is deleted on disconnect).

## 5. VPN declaration (VpnService)

| Question | Answer |
| --- | --- |
| Does your app use the VpnService API? | Yes |
| Core purpose | VPN: the app's main feature is a secure VPN tunnel to our servers |
| Is the user's data encrypted from the device to the VPN tunnel end point? | Yes (WireGuard; TCP mode adds TLS 1.3) |
| Does the app manipulate or redirect traffic, ads or monetization of other apps? | No |
| Does it collect personal data through the VPN? | No; no traffic or browsing data is logged |

Store listing must say it uses a VPN (the description above does). Upload a short video only if Play asks for one.

## 6. Closed testing (personal accounts: 12 testers for 14 days before production)

1. Testing → **Closed testing** → Create track (or use "Alpha") → **Testers**: create an e-mail list with at
   least 12 Gmail addresses (better 14–15; anyone who leaves makes the count drop).
2. **Create new release** → upload `raaz-play.aab` → release name e.g. `1.0.0 (build N)` → notes:
   "First test version." → Review → **Start rollout to Closed testing**.
3. Copy the **opt-in link** and send it to the testers. Each one opens it on their phone, taps **Become a tester**,
   then installs from Play. They should open the app and connect now and then during the 14 days.
4. After 14 days with 12+ testers: Dashboard → **Apply for production** (answers about the test are asked there).

## 7. Updating

Every push to `play-store` builds a new `raaz-play.aab` with a higher version code. Upload it as a new
release in the same track. When the ads version is ready (from `main`), it must keep the package
`com.raazvpn.app` and the same upload key, and the Ads declaration changes to Yes.
