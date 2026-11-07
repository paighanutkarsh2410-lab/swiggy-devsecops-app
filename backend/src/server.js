import app from "./app.js";
import { assertAuthConfigured } from "./auth/token.js";

const PORT = process.env.PORT || 3000;

assertAuthConfigured();

app.listen(PORT, () => {
  console.log(`Swiggy DevSecOps API running on port ${PORT}`);
});
