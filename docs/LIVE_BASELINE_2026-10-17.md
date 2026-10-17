# Live baseline, 2026-10-17

**Captured:** 2026-10-17 19:57:05 (Manila). The database clock read 2026-10-17 19:57:03 at the same moment.

**The live system is running commit `7dd3bd3`.** The numbers below were taken with the code in `HEAD` (six commits newer, `961d6af`), read-only, against the live database. The purpose is to compare them after the deploy of the registration-options work: **nothing in them should change** until the data fill (commit 5).

## How it was taken

- **Read-only:** `SHOW transaction_read_only` returned `on` before any query.
- **No view was called.** `reports_data`, `dashboard_data`, `arrival_monitoring_data` and `bootstrap_data` run `sweep_no_shows()`, which writes. The service functions were tried directly, each inside a savepoint, and the rest was counted with queries.
- **Counts and option / resort names only.** No visitor name, email, phone number, survey id or review text.
- The new columns (`is_active`, `stay_nights`) **do not exist on live yet**: columns found = `[]` (an empty list means none).

### Which service functions ran against the live schema

| function | result |
|---|---|
| `build_dashboard_payload` | FAILED: ProgrammingError: column api_itinerary.stay_nights does not exist |
| `build_arrival_monitoring_payload` | FAILED: ProgrammingError: column api_itinerary.stay_nights does not exist |
| `build_tourism_question_answers` | FAILED: ProgrammingError: column api_itinerary.stay_nights does not exist |
| `build_reports_payload (resort)` | ran |
| `build_booking_management_payload` | ran |

The three that failed read `api_itinerary.stay_nights`, which does not exist on live until migration `0051` runs. They are exactly the reports Commit 3 changed. For those, the figures below are counted directly and use the **same name reading the live code uses today** (`itinerary_stay(name, None)`, which a parity test pins to the old code on all 12 names). **They were not read from the report functions themselves.**

## Check against the dashboard (2026)

| figure | counted here | on the dashboard |
|---|---|---|
| Total Revenue Collected | 2,336 | 2,336 |
| This Month's Arrivals | 12 | 12 |
| No-show rate | 47.1% | 47.1% |
| Domestic (Filipino) | 25 | 25 |
| Foreign | 6 | 6 |

All five match. (The dashboard's reporting date is the latest arrival date in 2026: 2026-10-28; bookings in 2026: 17; arrived visitors in 2026: 31.)

## 1. Tourist records by status

| status | records | visitors |
|---|---|---|
| arrived | 8 | 31 |
| pending | 2 | 7 |
| no_show | 8 | 21 |
| **total** | **18** | **59** |

## 2. Total visitors in the whole table

59 visitors over 18 records, all statuses and all years (arrived only: 31).

## 3. Every itinerary (all 12), by name

"Read as" is how the live reports read the name today (0 nights = same day).

| id | name | records (all) | visitors (all) | records (arrived) | visitors (arrived) | read as |
|---|---|---|---|---|---|---|
| 1 | Overnight | 2 | 7 | 1 | 4 | overnight (1 night) |
| 2 | Same Day | 5 | 14 | 1 | 5 | same day (0 nights) |
| 3 | 2 Nights | 5 | 20 | 2 | 10 | overnight (2 nights) |
| 4 | 3 Nights | 2 | 8 | 1 | 4 | overnight (3 nights) |
| 5 | 4 Nights | 2 | 4 | 2 | 4 | overnight (4 nights) |
| 6 | 5 Nights and above | 1 | 2 | 0 | 0 | overnight (5 nights) |
| 7 | 6 Nights | 0 | 0 | 0 | 0 | overnight (1 night) |
| 8 | Que | 0 | 0 | 0 | 0 | overnight (1 night) |
| 9 | Island Hopping Circuit | 0 | 0 | 0 | 0 | overnight (1 night) |
| 10 | Beach and Resort Day Tour | 0 | 0 | 0 | 0 | same day (0 nights) |
| 11 | Heritage and Lighthouse Stop | 0 | 0 | 0 | 0 | overnight (1 night) |
| 12 | Eco Adventure Trail | 1 | 4 | 1 | 4 | overnight (1 night) |
| | **total** | **18** | **59** | **8** | **31** | |

## 4a. Travel mode (vehicle), by name

| id | name | records (all) | visitors (all) | records (arrived) | visitors (arrived) |
|---|---|---|---|---|---|
| 1 | Private Vehicle | 10 | 34 | 4 | 17 |
| 2 | Public Utility Vehicle | 2 | 5 | 1 | 2 |
| 3 | Public Bus | 6 | 20 | 3 | 12 |
| 4 | Ferry / Port Transfer | 0 | 0 | 0 | 0 |
| 5 | Tourist Van | 0 | 0 | 0 | 0 |

## 4b. Boat type, by name

| id | name | records (all) | visitors (all) | records (arrived) | visitors (arrived) |
|---|---|---|---|---|---|
| 1 | Tourist Boat | 11 | 37 | 3 | 13 |
| 2 | Passenger Boat | 7 | 22 | 5 | 18 |

## 4c. Visit purpose, by name

| id | name | records (all) | visitors (all) | records (arrived) | visitors (arrived) |
|---|---|---|---|---|---|
| 1 | Leisure | 4 | 15 | 2 | 9 |
| 2 | Vacation | 10 | 32 | 4 | 14 |
| 3 | Business | 3 | 8 | 1 | 4 |
| 4 | Visit | 1 | 4 | 1 | 4 |
| 5 | Outing | 0 | 0 | 0 | 0 |
| 6 | Tour | 0 | 0 | 0 | 0 |
| 7 | Team Building | 0 | 0 | 0 | 0 |
| 8 | Travel | 0 | 0 | 0 | 0 |
| 9 | Swimming | 0 | 0 | 0 | 0 |
| 10 | Unwind | 0 | 0 | 0 | 0 |

## 5. Same day and overnight (the figure Commits 3 and 5 can move)

Counted with the name reading the live code uses today: "day" or "same" in the itinerary name is same day.

| population | same day: records | same day: visitors | overnight: records | overnight: visitors | average stay (nights) |
|---|---|---|---|---|---|
| **Arrived, 2026** (the dashboard and the report questions) | 1 | 5 | 7 | 26 | 1.8 |
| Arrived, all years | 1 | 5 | 7 | 26 | 1.8 |
| All statuses, all years | 5 | 14 | 13 | 45 | 1.7 |

The dashboard's Stay Type reads **Same Day 5 / Overnight 26** visitors (arrived, 2026), and the average stay is **1.8 night(s)** (56 visitor-nights over 31 visitors).

## 6. Average stay

1.8 night(s) per visitor (arrived, 2026); 1.7 counting every status and year. A "2" to "5" in a name gives that many nights, "day" / "same" gives 0, anything else gives 1. `6 Nights` is read as 1 night (no record uses it today).

## 7. Resorts

| resort | records (all) | visitors (all) | records (arrived) | visitors (arrived) |
|---|---|---|---|---|
| Rio Del Sol Beach Resort | 4 | 10 | 1 | 2 |
| Jovencio's Resort | 3 | 10 | 2 | 9 |
| Dona Choleng Camping Resort | 2 | 10 | 2 | 10 |
| Nenita Del Sol | 2 | 4 | 1 | 2 |
| Orlan Beach Resort | 2 | 8 | 1 | 4 |
| Villa Noe Beach | 2 | 7 | 1 | 4 |
| Tent Place | 1 | 3 | 0 | 0 |
| Villa Cleofas Cagbalete | 1 | 4 | 0 | 0 |
| Villa Pilarosa Beach Resort | 1 | 3 | 0 | 0 |

9 resorts have at least one record; resorts with none are not listed.

## 8. Years and months

| year | records (all) | records (arrived) | visitors (arrived) |
|---|---|---|---|
| 2026 | 17 | 8 | 31 |
| 2027 | 1 | 0 | 0 |

Reporting years offered: every year with a record, plus the current year.

| month | records (all) | records (arrived) | visitors (arrived) |
|---|---|---|---|
| 2026-09 | 10 | 5 | 19 |
| 2026-10 | 7 | 3 | 12 |
| 2027-09 | 1 | 0 | 0 |

## 9. Reviews

| total | hidden | not hidden |
|---|---|---|
| 3 | 0 | 3 |

## 10. The option rows that are really on live

**Itinerary** (12 rows): 1 Overnight; 2 Same Day; 3 2 Nights; 4 3 Nights; 5 4 Nights; 6 5 Nights and above; 7 6 Nights; 8 Que; 9 Island Hopping Circuit; 10 Beach and Resort Day Tour; 11 Heritage and Lighthouse Stop; 12 Eco Adventure Trail

**TravelMode** (5 rows): 1 Private Vehicle; 2 Public Utility Vehicle; 3 Public Bus; 4 Ferry / Port Transfer; 5 Tourist Van

**BoatType** (2 rows): 1 Tourist Boat; 2 Passenger Boat

**VisitPurpose** (10 rows): 1 Leisure; 2 Vacation; 3 Business; 4 Visit; 5 Outing; 6 Tour; 7 Team Building; 8 Travel; 9 Swimming; 10 Unwind
