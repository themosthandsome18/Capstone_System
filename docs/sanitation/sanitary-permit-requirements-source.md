# Sanitary permit requirements: source and approved mapping

## Source

- **Document:** "Standard Requirements in Securing Sanitary Permit".
- **Provenance:** client paper, signed by the Sanitation Inspector II, received 2026-11-18.
- **Scope:** documentary requirements for securing a sanitary permit. It does not list every physical on-site inspection criterion, and it is not a PD 856 inspection checklist.
- **Status:** the basis of the system's per-type requirement lists (`SanitaryRequirement`), applied by migrations 0077 and 0078.

## Transcription

### Standard requirements (all establishments)

1. DTI/SEC/CDA copy
2. Barangay Clearance of owner
3. Chest X-ray results (owner and employees)
4. Stool Examination (FOOD establishments only)
5. CTC/Cedula (owner and employees)
6. 1x1 picture (owner and employees)
7. Potability of Water Supply Source (AO-0010-2017 PNSDW 2017): Physical/Chemical results and Microbiological results

### Additional requirements by type (categories on the paper)

- Agro-industrial (Poultry/Piggery Farm)
- Water Refilling Station
- Drugstore
- Contractor/Sub-contractor; requirements vary by employee count: 1-60, 61-99, 100-199, 200-600, 601-2000
- Resorts and Picnic Grounds
- Boatman
- Massage/Physical Therapist
- Funeral Parlor
- Burial Ground
- Private Laboratory & Clinic
- Karaoke/Videoke Bar/CSW

### Additional requirements by type (verbatim, owner-provided transcription)

- **Agro-industrial establishment (Poultry/Piggery Farm):** DENR-EMB ECC or CNC; Waste Water Treatment Facility
- **Water Refilling Station:** NWRB Water Permit Certificate; DOH Operational Permit Certificate; Certificate of 40 hours Training Course (Owner); Water Safety Plan
- **Drugstore:** DOH License to Operate; PRC License of Pharmacist
- **Contractor/Sub-contractor:** Physical Examination of all Employees; Scope of Work; Full-time First Aider (1-60 employees); Full-time First Aider & Part-Time OH Nurse (61-99 employees); Part-Time OH Physician and Dentist and Full-time OH Nurse and First Aider (100-199 employees); Part-Time OH Physician and Dentist and Full-time OH Nurse and First Aider (200-600 employees); Full-Time OH Physician and Dentist and Full-time OH Nurse and First Aider (601-2000)
- **Resorts and Picnic Grounds:** Trained Lifeguard; Life Saving Equipment; First Aid Kit; Waste Water Treatment Facility
- **Boatman:** Life Vest; MARINA Certificate of License of Boatman; First Aid Kit
- **Massage/Physical Therapist:** License of Physical Therapist; NC2 Certification of Massage Therapist; Hepa B Screening
- **Funeral Parlor:** License of Embalmer; DOH License to Operate Certificate
- **Burial Ground:** Operational Clearance from DOH Regional Office
- **Private Laboratory & Clinic:** DOH License to Operate Certificate; PRC License of MedTech and RadTech; Hepa B Screening or anti Hepa B Vaccination; Special Waste Facility and MOA with Service Provider
- **Karaoke/Videoke Bar/CSW:** Hepa B Screening; Regular Smear; NSO Birth Certificate

### Transcription notes

- The title is cut off on the paper ("Permi").
- "RadTRech" on the paper is read as RadTech.
- The 100-199 and 200-600 contractor lines are identical except for the range.

### System wording vs paper

The system keeps its existing wording for the standard items and for the Sub-contractor and other additional items: same meaning, slightly different text (for example "Certificate of 40-hour Training Course (Owner)", "Drug Store", "Karaoke / Video Bar / CSW"). Only the two owner-approved changes were made to match the paper: the Water Refilling Station item "Certificate of Potability of Product Water" was removed, and the Private Laboratory & Clinic item was renamed to "PRC License of MedTech and RadTech".

## Approved mapping decisions (owner, 2026-11-18 / 2026-11-19)

1. **The business type decides the requirements, not SP/Large coverage.** SP and Large establishments of the same type get the same list (migration 0077 adds the missing SP rows).
2. **Food Establishment, Commercial Non Food, Ambulant Food Vendor:** the 7 standard items for both sizes, using the system's existing standard item names (migration 0078).
3. **Stool Examination** ("Stool Examination result (for food establishments only)"): Restaurant / Food Establishment, Public Market Stall, Food Establishment and Ambulant Food Vendor. Not Commercial Non Food.
4. **Water Refilling Station:** "Certificate of Potability of Product Water" is removed. Both standard Potability of Water Supply items stay.
5. **Private Laboratory & Clinic:** "PRC License of MedTech/RadTech/Nurse/Doctor" is renamed "PRC License of MedTech and RadTech".
6. **Sub-contractor:** unchanged; the five employee-count range items stay as checklist items (the system has no employee-count field).

The system keeps its existing item wording. The standard items appear in the system as: "Xerox copy of DTI/SEC/CDA", "Barangay Clearance of owner", "Chest X-ray Results (Owner & employees)", "CTC/Cedula of owner and employees", "1x1 picture of owner and employees", "Potability of Water Supply - Physical/Chemical Examination", "Potability of Water Supply - Microbiological Examination".

## Resulting list per business type (SP and Large identical)

All items are required. "Standard 7" means the seven standard items above.

| Business type | Items |
|---|---|
| Water Refilling Station | Standard 7; DOH Operational Permit Certificate; Certificate of 40-hour Training Course (Owner); Water Safety Plan; NWRB Water Permit Certificate |
| Agro-industrial Establishment (Poultry / Piggery Farm) | Standard 7; DENR-EMB ECC or CNC; Waste Water Treatment Facility |
| Restaurant / Food Establishment | Standard 7; Stool Examination result (for food establishments only) |
| Public Market Stall | Standard 7; Stool Examination result (for food establishments only) |
| Food Establishment | Standard 7; Stool Examination result (for food establishments only) |
| Ambulant Food Vendor | Standard 7; Stool Examination result (for food establishments only) |
| Commercial Non Food | Standard 7 |
| Drug Store | Standard 7; DOH License to Operate; PRC License of Pharmacist |
| Sub-contractor | Standard 7; Physical Examination of all Employees; Scope of Work; Full-time First Aider (1-60 employees); Full-time First Aider and Part-Time OH Nurse (61-99 employees); Part-Time OH Physician and Dentist, Full-time OH Nurse, and First Aider (100-199 employees); Part-Time OH Physician and Dentist, Full-time OH Nurse, and First Aider (200-600 employees); Full-time OH Physician and Dentist, Full-time OH Nurse, and First Aider (601-2000 employees) |
| Resort / Picnic Ground | Standard 7; Trained Lifeguard; Life Saving Equipment; First Aid Kit; Waste Water Treatment Facility |
| Boatman | Standard 7; Life Vest; MARINA Certificate of License of Boatman; First Aid Kit |
| Massage / Physical Therapy | Standard 7; License of Physical Therapist; NC2 Certification of Massage Therapist; Hepa B Screening |
| Funeral Parlor | Standard 7; License of Embalmer; DOH License to Operate Certificate |
| Burial Ground | Standard 7; Operational Clearance from DOH Regional Office |
| Private Laboratory & Clinic | Standard 7; DOH License to Operate Certificate; PRC License of MedTech and RadTech; Hepa B Screening or anti Hepa B Vaccination; Special Waste Facility and MOA with Service Provider |
| Karaoke / Video Bar / CSW | Standard 7; Hepa B Screening; Regular Smear; NSO Birth Certificate |

## How the data changes

- Migration 0077 (`backend/api/migrations/0077_sp_requirements_match_large.py`): add-only; SP gets every Large item of the 13 seed types.
- Migration 0078 (`backend/api/migrations/0078_apply_client_requirement_list.py`): the decisions above, in one transaction. It aborts and changes nothing if any inspection checklist row or permit renewal still uses a name being removed or renamed, if a rename target already exists, or if the result would differ from the approved list.
- Both migrations match business types by exact name and have no-op reverses, because inspection checklist rows refer to requirements by name.
- Types without requirements in this table (for example importer-created types such as "Pool / Resort" or "Public Transport") are unchanged.
