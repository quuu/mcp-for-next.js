// Export the tool registry
export { toolRegistry, API_CONFIG } from "./config";

// Import all tools to register them
import "./webSearch";
import "./researchPaperSearch";
import "./twitterSearch";
import "./companyResearch";
import "./crawling";
import "./competitorFinder";

// When adding a new tool, import it here
// import "./newTool;
