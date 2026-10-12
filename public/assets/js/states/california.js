/**
 * California configuration.
 * Source: California Retail Food Code (Health & Safety Code, Division 104, Part 7).
 * Section numbers in `cite` refer to that code.
 */
(function (LC) {
  "use strict";

  const COOKING = "Cooking (final internal temp)";
  const SANITIZER = "Sanitizer & water";

  LC.config = {
    id: "ca",
    name: "California",

    /** Page copy. `{label}` in inspectionIntro is replaced with the priority badge. */
    text: {
      codeName: "California Retail Food Code",
      localityLabel: "County",
      localityPlaceholder: "e.g. Alameda",
      coolingNote: "Hot food must drop from 135°F to 70°F within 2 hours, then to 41°F within 6 hours total (§114002).",
      inspectionIntro:
        "Walk the kitchen the way a county inspector would. Items marked {label} are the risk factors that cost the most points and can close a facility.",
      footer:
        "Section numbers refer to the California Retail Food Code (Health & Safety Code, Division 104, Part 7). Counties and cities add their own rules and set their own permit dates and fees. Confirm anything you're unsure about with your county environmental health office. This tool helps you keep records; it isn't legal advice.",
      priorityLabel: "Major",
      priorityAllDone: "Every major risk factor is confirmed.",
      starterIntro:
        "renewals most California restaurants track: health permit, manager and food handler certificates, hood cleaning, fire suppression, backflow, grease, pest control and more.",
    },

    /** Spot checks offered in the reading log. A reading passes when min ≤ value ≤ max. */
    checks: [
      { key: "cook_poultry", group: COOKING, label: "Poultry or stuffed food", unit: "°F", min: 165, rule: "165°F or higher" },
      { key: "cook_ground", group: COOKING, label: "Ground meat or fish", unit: "°F", min: 155, rule: "155°F or higher for 15 seconds" },
      { key: "cook_whole", group: COOKING, label: "Whole-muscle meat, fish, eggs", unit: "°F", min: 145, rule: "145°F or higher for 15 seconds" },
      { key: "reheat", group: COOKING, label: "Reheat for hot holding", unit: "°F", min: 165, rule: "165°F within 2 hours" },
      { key: "chlorine", group: SANITIZER, label: "Sanitizer: chlorine", unit: "ppm", min: 100, rule: "100 ppm or higher" },
      { key: "quat", group: SANITIZER, label: "Sanitizer: quat", unit: "ppm", min: 200, rule: "200 ppm, or the label's concentration" },
      { key: "dish", group: SANITIZER, label: "Dish machine final rinse", unit: "°F", min: 180, rule: "180°F at the manifold (high-temp machine)" },
      { key: "handwash", group: SANITIZER, label: "Handwash sink water", unit: "°F", min: 100, rule: "100°F or higher" },
      { key: "calib", group: SANITIZER, label: "Thermometer ice-point check", unit: "°F", min: 30, max: 34, rule: "32°F ± 2°F in ice water" },
    ],

    shiftChecks: [
      {
        group: "Opening",
        items: [
          { id: "soap", text: "Handwash sinks stocked with soap and paper towels, nothing stored in them" },
          { id: "hotwater", text: "Hot water at every sink" },
          { id: "sani", text: "Sanitizer buckets mixed and tested with strips" },
          { id: "health", text: "Staff asked about vomiting, diarrhea, jaundice, sore throat with fever" },
          { id: "probe", text: "Clean, calibrated probe thermometer on the line" },
          { id: "pests", text: "No droppings, live insects or gnaw marks" },
          { id: "labels", text: "Prepped food covered, labeled and 6 in. off the floor" },
        ],
      },
      {
        group: "Closing",
        items: [
          { id: "coolchk", text: "Every cooling batch checked and logged" },
          { id: "tphc", text: "Food held on time control discarded at 4 hours" },
          { id: "clean", text: "Food-contact surfaces washed, rinsed, sanitized" },
          { id: "trash", text: "Trash out, dumpster lid closed, grease bin covered" },
          { id: "doors", text: "Back door closed, screens and air curtains working" },
        ],
      },
    ],

    /** Self-inspection walkthrough. `priority` items are flagged with text.priorityLabel. */
    inspection: [
      {
        title: "Knowledge & permits",
        items: [
          { id: "p1", text: "Health permit is current and posted where customers can see it" },
          { id: "p2", text: "A Certified Food Protection Manager is on staff and the certificate is on site", cite: "§113947.1" },
          { id: "p3", text: "Every food handler has a valid card (within 30 days of hire); copies are on file", cite: "§113948" },
          { id: "p4", text: "The person in charge can explain holding temps, cooling steps and the illness policy" },
        ],
      },
      {
        title: "Employee health & hygiene",
        items: [
          { id: "h1", text: "Staff know to report vomiting, diarrhea, jaundice and diagnosed illness; exclusion policy is written", priority: true },
          { id: "h2", text: "Handwash sinks are accessible, stocked, used only for handwashing, and at 100°F or more", cite: "§113953", priority: true },
          { id: "h3", text: "No bare-hand contact with ready-to-eat food; gloves or utensils in use", cite: "§113961", priority: true },
          { id: "h4", text: "Hair restrained; staff drinks are covered and kept away from prep areas" },
        ],
      },
      {
        title: "Time & temperature",
        items: [
          { id: "t1", text: "Every cold-holding unit holds food at 41°F or below", cite: "§113996", priority: true },
          { id: "t2", text: "Hot-held food is at 135°F or above", cite: "§113996", priority: true },
          { id: "t3", text: "Cooling follows 135→70°F in 2 h, →41°F in 6 h, and the log shows it", cite: "§114002", priority: true },
          { id: "t4", text: "Food reheated for hot holding reaches 165°F within 2 hours", cite: "§114016", priority: true },
          { id: "t5", text: "Cooked foods reach required final temps and are spot-checked", cite: "§114004", priority: true },
          { id: "t6", text: "Any food on time control has written procedures and a marked discard time", cite: "§114000", priority: true },
          { id: "t7", text: "A working probe thermometer (accurate to ±2°F) is on hand" },
        ],
      },
      {
        title: "Protection from contamination",
        items: [
          { id: "c1", text: "Raw meat stored below and away from ready-to-eat food", priority: true },
          { id: "c2", text: "Food covered, labeled and stored at least 6 inches off the floor" },
          { id: "c3", text: "Wiping cloths are kept in sanitizer between uses" },
          { id: "c4", text: "Sanitizer is at the right strength and test strips are on hand", cite: "§114099.6", priority: true },
          { id: "c5", text: "Dish machine or 3-compartment sink reaches sanitizing temp or concentration", cite: "§114099.6", priority: true },
        ],
      },
      {
        title: "Sources & labeling",
        items: [
          { id: "a1", text: "All food comes from approved sources and invoices are kept", priority: true },
          { id: "a2", text: "Shellfish tags are kept for 90 days after the container is emptied" },
          { id: "a3", text: "Menu has a consumer advisory for raw or undercooked animal foods", cite: "§114093" },
          { id: "a4", text: "Bulk food containers are labeled with the food's name" },
        ],
      },
      {
        title: "Facility & records",
        items: [
          { id: "f1", text: "Hot and cold running water; no sewage or drain backups", priority: true },
          { id: "f2", text: "No sign of rodents, roaches or flies", priority: true },
          { id: "f3", text: "Chemicals are labeled and stored below and away from food" },
          { id: "f4", text: "Restrooms are clean, stocked and have self-closing doors" },
          { id: "f5", text: "Pest control reports, grease pumping receipts and hood cleaning tags are on file" },
          { id: "f6", text: "The last 90 days of temperature and cooling logs are easy to show" },
        ],
      },
    ],

    /** "Add starter list" on the Permits & renewals tab. */
    starter: [
      { name: "County health permit", category: "permit", cycleMonths: 12, agency: "County environmental health", notes: "Annual. Your county sets the renewal date and fee." },
      { name: "Food Protection Manager certificate", category: "cert", cycleMonths: 60, agency: "ANSI-accredited exam provider", notes: "At least one owner or employee must hold one. Valid 5 years." },
      { name: "Food handler cards", category: "cert", cycleMonths: 36, agency: "ANSI-accredited training provider", notes: "Each food employee, within 30 days of hire. Valid 3 years. Employer pays for training time and cost." },
      { name: "City business license / tax certificate", category: "permit", cycleMonths: 12, agency: "City finance or treasurer", notes: "" },
      { name: "ABC liquor license", category: "permit", cycleMonths: 12, agency: "Dept. of Alcoholic Beverage Control", notes: "Only if you serve alcohol." },
      { name: "Seller's permit: sales tax return", category: "labor", cycleMonths: 3, agency: "CDTFA", notes: "Filing frequency is set by CDTFA. Quarterly is common." },
      { name: "Kitchen hood & duct cleaning", category: "fire", cycleMonths: 6, agency: "Hood cleaning contractor", notes: "NFPA 96: quarterly for high-volume (wok, charbroil, 24-hour), semiannual for moderate." },
      { name: "Fire suppression system inspection", category: "fire", cycleMonths: 6, agency: "Licensed fire protection contractor", notes: "Semiannual service tag on the hood system." },
      { name: "Portable fire extinguishers service", category: "fire", cycleMonths: 12, agency: "Licensed fire protection contractor", notes: "Annual service. Do a monthly visual check too, including the K-class unit." },
      { name: "Fire department operating permit", category: "fire", cycleMonths: 12, agency: "City or county fire marshal", notes: "Required in many jurisdictions for assembly occupancy or cooking operations." },
      { name: "Backflow preventer test", category: "service", cycleMonths: 12, agency: "Water supplier / certified tester", notes: "Annual test report goes to your water supplier." },
      { name: "Grease interceptor pumping", category: "service", cycleMonths: 3, agency: "Grease hauler", notes: "Interval set by your local FOG program." },
      { name: "Pest control service", category: "service", cycleMonths: 1, agency: "Pest control operator", notes: "Keep every service report for the inspector." },
      { name: "Labor law posters", category: "labor", cycleMonths: 12, agency: "Employer", notes: "Refresh each January when minimum wage and notices change." },
      { name: "IIPP & Workplace Violence Prevention Plan review", category: "labor", cycleMonths: 12, agency: "Cal/OSHA", notes: "Both written plans are required. Review and train yearly." },
    ],

    /** Employee files (features/employees.js). */
    employees: {
      certTypes: {
        fh: { label: "California Food Handler Card", months: 36 },
        cfpm: { label: "Food Protection Manager", months: 60 },
        rbs: { label: "RBS certification (alcohol)", months: 36 },
        allergen: { label: "Allergen awareness", months: 0 },
        other: { label: "Other certification", months: 0 },
      },
      /** Food handler card due within `dueDays` of hire; a valid `coveredBy` certificate exempts the employee. */
      handler: {
        type: "fh",
        coveredBy: "cfpm",
        dueDays: 30,
        hint: "California food handler cards are due within 30 days of hire and last 3 years. A valid Food Protection Manager certificate exempts the employee. The employer pays for the training and the time.",
      },
      /** Responsible Beverage Service training for anyone who serves alcohol at an on-sale licensee. */
      alcohol: { type: "rbs", label: "RBS certification needed (within 60 days of hire)", k: "warn" },
      onboarding: [
        { id: "i9", text: "Form I-9 completed", note: "Section 2 within 3 business days of the first day of work" },
        { id: "w4", text: "Form W-4 and DE 4 on file", note: "Federal and California withholding" },
        { id: "newhire", text: "New hire reported to EDD (DE 34)", note: "Within 20 days of the start date" },
        { id: "wagenotice", text: "Wage notice given (Labor Code 2810.5)", note: "At hire" },
        { id: "health", text: "Signed employee illness reporting agreement", note: "Symptoms and diagnoses they must report to the person in charge" },
        { id: "policies", text: "Handbook and kitchen policies acknowledged" },
      ],
    },
  };
})((window.LineCheck = window.LineCheck || {}));
