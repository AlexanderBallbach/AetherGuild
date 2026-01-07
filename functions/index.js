const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

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
