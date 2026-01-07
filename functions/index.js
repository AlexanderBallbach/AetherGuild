const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const SunCalc = require("suncalc");
// const axios = require("axios"); // Reserved for future Weather API integration

admin.initializeApp();

/**
 * Creates a user profile in Firestore when a new user signs up.
 * This profile stores essential investigator data like rank and reputation.
 */
exports.createInvestigatorProfile = functions.auth.user().onCreate((user) => {
  const newUserProfile = {
    email: user.email,
    displayName: user.displayName || "New Investigator",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    rank: 0, // "Witness"
    reputationPoints: 10,
  };

  const db = admin.firestore();
  return db.collection("users").doc(user.uid).set(newUserProfile)
    .then(() => {
      console.log(
        `Successfully created Investigator Profile for ${user.uid}`
      );
      return null;
    })
    .catch((error) => {
      console.error(
        `Failed to create Investigator Profile for ${user.uid}:`,
        error
      );
      return null;
    });
});

/**
 * Automatically enriches new reports with astronomical and environmental metadata.
 * Triggers when a new report is created in the 'reports' collection.
 */
exports.enrichReportMetadata = functions.firestore
  .document("reports/{reportId}")
  .onCreate(async (snap, context) => {
    const reportData = snap.data();
    const reportId = context.params.reportId;

    // 1. Get location and time
    // const lat = reportData.lat;
    // const lng = reportData.lng;
    // Handle Firestore Timestamp or standard Date string
    const date = reportData.timestamp ?
      reportData.timestamp.toDate() : new Date();

    // 2. Calculate Astronomical Data (Moon Phase)
    // SunCalc.getMoonIllumination returns object with fraction, phase, angle
    const moonInfo = SunCalc.getMoonIllumination(date);

    // Map phase value (0.0 - 1.0) to human readable name
    const getMoonPhaseName = (phase) => {
      if (phase === 0 || phase === 1) return "New Moon";
      if (phase < 0.25) return "Waxing Crescent";
      if (phase === 0.25) return "First Quarter";
      if (phase < 0.5) return "Waxing Gibbous";
      if (phase === 0.5) return "Full Moon";
      if (phase < 0.75) return "Waning Gibbous";
      if (phase === 0.75) return "Last Quarter";
      return "Waning Crescent";
    };

    const metadata = {
      astronomy: {
        moonPhase: getMoonPhaseName(moonInfo.phase),
        illumination: (moonInfo.fraction * 100).toFixed(1) + "%",
      },
      // Placeholder for future API integrations (Weather, Solar Kp)
      weather: {
        condition: "Data Pending (API Integration)",
        pressure: "Unknown",
      },
      enrichedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "pending_review", // Set default status to pending
    };

    // 3. Update the report with the new metadata
    console.log(`Enriching report ${reportId} with metadata:`, metadata);

    try {
      await snap.ref.update({
        metadata: metadata,
        status: "pending_review", // Ensure status is set
      });
      console.log("Report successfully enriched.");
    } catch (error) {
      console.error("Failed to enrich report:", error);
    }
  });
