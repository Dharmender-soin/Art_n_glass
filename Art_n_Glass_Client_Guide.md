# 🏢 Art & Glass — Sales Management App
## Client Guide & Feature Documentation

> **Version:** June 2026 | Prepared by: Development Team  
> **For:** Art & Glass Management (MD, Admin, Managers, Executives)

---

## 📋 Table of Contents

1. [App Overview](#overview)
2. [Who Uses What — Roles Explained](#roles)
3. [Command Centre — MD Dashboard](#command-centre)
4. [New Features Added](#new-features)
5. [All Pages & Their Purpose](#all-pages)
6. [How to Use — Step by Step](#how-to-use)
7. [AI Assistant Guide](#ai-assistant)
8. [Frequently Asked Questions](#faq)

---

## 1. App Overview {#overview}

**Art & Glass Sales Management App** ek complete CRM (Customer Relationship Manager) system hai jo Art & Glass company ke liye specifically banaya gaya hai.

### Is App Ka Kaam Kya Hai?

| Kya Karta Hai | Faida |
|---|---|
| Executives ke daily visits track karta hai | Pata chalta hai kaun kaam kar raha hai |
| Clients aur Partners manage karta hai | Sab data ek jagah |
| Work Orders (WOS) ka pipeline track karta hai | Kitne order aaye, kitne jeetay, kitne lose hue |
| MD/Admin ko poora company ka overview deta hai | Bina kisi se pooche pata chal jata hai |
| AI se koi bhi sawaal pooch sakte ho | Apna data samajhna aasaan ho gaya |

---

## 2. Who Uses What — Roles Explained {#roles}

```
MD / Admin
│
├── Dekh sakte hain: POORI COMPANY ka data
├── Access: Command Centre (MD Dashboard)
├── Kar sakte hain: Export CSV, sab filters
│
Manager (Showroom Head)
│
├── Dekh sakte hain: APNE SHOWROOM ka data
├── Access: Dashboard, Visits, Reports
├── Kar sakte hain: Apne executives ka performance dekhna
│
Executive (Sales Person)
│
├── Dekh sakte hain: SIRF APNA data
├── Access: Visits, Clients, Partners, Pipeline
└── Kar sakte hain: Visits log karna, clients add karna
```

---

## 3. Command Centre — MD Dashboard {#command-centre}

> **Sirf MD aur Admin ke liye accessible hai**

### Command Centre Kya Hai?

Command Centre ek **Real-Time Intelligence Dashboard** hai. Yahan par baith ke MD ko pata chal sakta hai:
- 🏪 **Kaunsa showroom best perform kar raha hai**
- 🔴 **Kaunsa showroom problem mein hai**
- 👤 **Kaunsa employee active hai, kaunsa nahi**
- 🤝 **Kaunse partners ko lamba time se visit nahi kiya**
- 📊 **Overall pipeline ka status**

---

### Command Centre Ki Sections

#### 🔴 Action Required Banner (NEW — Auto Alert)

> Yeh **automatically appear hota hai** jab koi serious issue ho.

**Kab dikhta hai:**
- Koi showroom mein 2 ya zyada employees inactive hain
- Koi showroom mein selected period mein ZERO visits hain
- Koi employee ne kabhi bhi visit nahi kiya

**Kaise dikhta hai:**
```
┌─────────────────────────────────────────────────────┐
│  ⚠️ ACTION REQUIRED                                  │
│  🏪 Zirakpur — 3 inactive · 0 visits                │
│  👤 2 employees never visited       Auto-detected   │
└─────────────────────────────────────────────────────┘
```

**MD ko kya karna chahiye:**
→ Woh showroom filter click karein → Employee section mein jaayein → Inactive employees ko dekh kar action lein

---

#### 📊 KPI Strip — Top 5 Numbers

Sabse upar 5 important numbers dikhte hain:

| Number | Matlab |
|---|---|
| **Total Visits** | Selected period mein kitne visits hue |
| **WOS / Won** | Kitne Work Orders liye gaye / Kitne jeet gaye |
| **Active Employees** | Aaj ya kal visit kiya |
| **Inactive** | 7+ din se koi visit nahi |
| **Partner Coverage** | Kitne percent partners ko visit kiya |

**Trend Arrow:**
- ▲ Green = pichle period se better
- ▼ Red = pichle period se worse

---

#### 💡 Business Health — At a Glance

8 instant insights jo automatically calculate hote hain:

| Insight | Kya Batata Hai |
|---|---|
| 🏆 **Best Showroom** | Highest score wala showroom |
| ⬇️ **Weakest Showroom** | Lowest score wala — needs attention |
| 🥇 **Best Employee** | Top performer overall |
| ❗ **Needs Attention** | Employee jo sabse zyada dino se inactive hai |
| 🔝 **Top Visit Leader** | Sabse zyada visits karne wala |
| ⭐ **Top WOS Contributor** | Sabse zyada WOS add karne wala |
| 🤝 **Most Used Partner** | Sabse zyada visit kiya partner |
| 👁️ **Most Ignored Partner** | Sabse lamba time se bina visit wala |

---

#### ⚡ Smart Alerts & Action Items

App **automatically detect karta hai** ki kya galat chal raha hai:

**Critical Alerts (Laal):**
- ❌ Employee X ne 10+ din se koi visit nahi kiya
- ❌ 5 partners 30+ din se bina visit ke hain

**Warning Alerts (Amber):**
- ⚠️ 3 employees 3-7 din se at-risk hain
- ⚠️ Showroom Y ka win rate 20% se neeche hai
- ⚠️ 2 employees visits karte hain but WOS nahi add karte

**Positive Alerts (Green):**
- ✅ Employee Z ne 15 visits aur 5 order jeetay
- ✅ Best showroom report

---

#### 🏪 Showroom Performance Cards

Har showroom ka **score card** dikhta hai:

```
┌──────────────────────────────────────────┐
│  🥇 Best   Kirti Nagar               78  │
│  ████████████████████░░░░  score bar     │
│  🤝 Partner Coverage: 85%               │
│                                          │
│  Visits  WOS   Won   Win%               │
│  24      12    4     33%                │
└──────────────────────────────────────────┘
```

**Showroom Filter kaise use karein:**
- **Upar chips (All / Showroom Name)** click karo
- Sab data filter ho jayega sirf us showroom ka

**Compare Button:**
- "Compare" click karo → Side-by-side table aata hai
- Clearly pata chalta hai kaun best hai aur kaun worst

---

#### 👥 Employee Performance Table

Sab employees ki list score ke basis par sorted hoti hai:

| Column | Matlab |
|---|---|
| **Status** | 🟢 Active / 🟡 At Risk / 🔴 Inactive |
| **Visits** | Period mein total visits |
| **WOS** | Work Orders added |
| **Won** | Orders won |
| **Win%** | Kitne percent orders jeetay |
| **Last Active** | Pichli visit kab thi |
| **Score** | 0-100 performance score |

**Filters:**
- 🏆 Top 5 — Sabse acche performers
- 🟢 Active — Jo kaam kar rahe hain
- 🟡 At Risk — Jo slow ho rahe hain
- 🔴 Inactive — Turant dhyan chahiye
- ⚠️ 0 Visits — Abhi tak koi visit nahi

**Search:** Name ya showroom se search kar sakte hain

---

#### 🤝 Partner Utilization

Real partners (Architects, Builders) ki list:
- 🟢 **Active** — 14 din ke andar visit kiya
- 🟡 **Low Activity** — 15-45 din se visit nahi
- 🔴 **Neglected** — 45+ din ya kabhi nahi

Har partner card mein dikhta hai:
- Kitne leads diye
- Kitne hot leads hain
- Kitne orders un se aaye
- Kis executive ne sabse zyada visit kiya

---

#### 📈 Pipeline Summary by Showroom

Har showroom ka Work Order funnel:

```
Showroom     Pending  Quoted  Won  Lost  Win%
Kirti Nagar    8        3      4    2    36%
Zirakpur       5        2      1    3    14% ← LOW!
Gurgaon        12       5      7    0    58% ← BEST!
```

---

#### 🏆 Leaderboard

Top 5 employees ranked by:
- **Most Visits** — Sabse zyada clients/partners se mila
- **Most WOS** — Sabse zyada work orders add kiya
- **Most Won** — Sabse zyada orders jeetay

---

### Command Centre ke Date Filters

Upar left side mein 3 options:
- **Today** — Sirf aaj ka data
- **Last 7 Days** — Hafte bhar ka
- **This Month** — Is mahine ka

---

## 4. New Features Added {#new-features}

### ✅ Feature 1: Auto "Action Required" Banner

**Kya hai:** Jab bhi koi showroom ya employee ki situation critical ho, ek **red banner automatically appear hota hai** Command Centre ke top par.

**Kab aata hai:**
- Showroom mein 2+ inactive employees hain
- Koi employee ne kabhi visit nahi kiya

**Kaise help karta hai:** MD ko manually dekhna nahi padta — app khud alert karta hai.

---

### ✅ Feature 2: CSV Export Button

**Kaha hai:** Command Centre ke header mein — "Export" button (📥 icon ke saath)

**Kya download hota hai:** Ek Excel/CSV file jisme sab employees ki performance hai:
- Name, Role, Showroom
- Status (Active/At Risk/Inactive)
- Visits, WOS, Won counts
- Win%, Score
- Last visit date

**File name:** `art-glass-employees-2026-06-08.csv` (date automatic)

**Kaise use karein:**
1. Command Centre mein jaao
2. Upar right corner mein "Export" button dhundo
3. Click karo — file automatically download hogi
4. Excel mein open karo aur present karo

---

### ✅ Feature 3: AI Assistant — Gemini Powered

**Kahan hai:** Screen ke bottom-right corner mein ek floating button (glass animation ke saath)

**Kya pooch sakte ho:**

*Executive ke liye:*
- "How many visits did I do this week?"
- "Which clients are waiting for quotation?"

*Manager ke liye:*
- "Who closed the most orders this month?"
- "Show pending WOS in my showroom"

*MD ke liye:*
- "Overall pipeline across all showrooms"
- "Which showroom is performing best?"
- "Which employees are inactive?"

---

## 5. All Pages & Their Purpose {#all-pages}

| Page | Kiske Liye | Kya Karta Hai |
|---|---|---|
| **Dashboard** | All roles | Charts, visit trends, order status |
| **Command Centre** | MD, Admin only | Full company intelligence hub |
| **Visits** | Executive, Manager | Plan, check-in, mark done visits |
| **Clients** | Executive | Client add karo, status update karo |
| **Partners** | Executive | Partner (Architects/Builders) manage karo |
| **Partner Visits** | All | Partner visit history aur analytics |
| **My Pipeline** | Executive, Manager | WOS (Work Order Scope) track karo |
| **Reports** | Manager, MD | Detailed reports |
| **Conveyance** | Executive | Travel expenses ka hisaab |
| **Verification** | Manager | WOS items verify karo |
| **Hierarchy** | All | Company structure dekho |
| **Profile** | All | Apna profile edit karo |

---

## 6. How to Use — Step by Step {#how-to-use}

### MD/Admin — Daily Routine

**Subah sabse pehle:**
1. App open karo → **Command Centre** mein jao
2. **Action Required Banner** dekho (agar hai to turant action lo)
3. **KPI Strip** dekho — Visits ka trend upar ya neeche?
4. **Smart Alerts** dekho — Critical ya Warning alerts?
5. Showroom cards mein weakest showroom identify karo
6. Employee table mein inactive employees note karo

**Follow-up action:**
- Inactive employee ke manager ko call karo
- Showroom filter click karo → Us showroom ka detail dekho
- **Compare** button se showrooms compare karo

**Month end reporting:**
1. **Export** button click karo → CSV download karo
2. Excel mein open karo → Client ya management ko send karo

---

### Manager — Daily Routine

1. **Dashboard** mein apne showroom ka overview dekho
2. **Visits** page mein executives ki visits check karo
3. **Partner Visits** mein neglected partners identify karo
4. **My Pipeline** mein pending WOS check karo
5. **Verification** mein WOS verify karo

---

### Executive — Daily Routine

1. **Visits** page → Plan Visit click karo → Aaj ki visits schedule karo
2. Client ke paas jao → Check In karo (GPS se)
3. Visit complete hone par → Mark Done karo (photo + remarks + GPS)
4. Naye client/partner milein → **Clients** ya **Partners** mein add karo
5. Koi order scope ho → **My Pipeline** mein WOS add karo

---

## 7. AI Assistant Guide {#ai-assistant}

### Kaise Start Karein?

1. Screen ke **bottom-right corner** mein glass animation wala button dhundo
2. Click karo → Chat window khulta hai
3. Sawaal type karo ya **Quick Questions** chips click karo
4. AI data fetch karke answer deta hai

### Quick Questions (Ready-made):

**Executive ke liye:**
- How many site visits for measurements did I do this week?
- Which clients are waiting for a glass quotation?
- Show my glass installation pipeline summary
- Which architect should I follow up with today?

**Manager ke liye:**
- Which executive closed the most glass interiors this month?
- Show pending installations & WOS in my showroom
- What is our conversion rate with architects?
- Which high-value leads have been inactive?

**MD ke liye:**
- Overall glass & art pipeline across all showrooms
- Which showroom is performing the best?
- Total revenue from glass installations this month
- How many active WOS items are there across the company?

---

## 8. Frequently Asked Questions {#faq}

**Q: Data real-time hai ya delayed?**
> A: Almost real-time. Refresh button (🔄) press karo — data turant update hota hai.

**Q: Agar employee GPS se visit mark kare to kya guarantee hai ki woh wahan tha?**
> A: App GPS coordinates store karta hai. Live Map mein dekh sakte hain exact location.

**Q: CSV export mein kya kya data hota hai?**
> A: Employee ka naam, role, showroom, status, visits, WOS, won orders, win rate, score, aur last visit date.

**Q: Partner Coverage percentage kya hota hai?**
> A: Kitne percent real partners (architects/builders) ko visit kiya gaya — e.g., 70% means 10 mein se 7 partners ko visit kiya.

**Q: Score 0-100 kaise calculate hota hai?**
> A: Visits (30%) + WOS (30%) + Won orders (30%) + Active status (10%) = Total Score

**Q: "WOS" kya hota hai?**
> A: Work Order Scope — Jab koi client glass ya art ka order deta hai to uska scope (kya kaam karna hai, kitne mein) yahan add kiya jata hai.

**Q: App mobile mein bhi chalti hai?**
> A: Haan! App fully responsive hai. Mobile browser aur Android app dono mein kaam karta hai.

---

## 📞 Technical Support

Agar koi issue aaye ya naya feature chahiye:
- Developer ko contact karein
- Screenshot ke saath issue describe karein

---

*Document prepared: June 2026 | Art & Glass Sales Management System*
