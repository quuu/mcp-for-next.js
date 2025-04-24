import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TodoistApi } from "@doist/todoist-api-typescript";

// Check for API token
const TODOIST_API_TOKEN = process.env.TODOIST_API_TOKEN!;
if (!TODOIST_API_TOKEN) {
  console.error("Error: TODOIST_API_TOKEN environment variable is required");
  process.exit(1);
}

// Initialize Todoist client
const todoistClient = new TodoistApi(TODOIST_API_TOKEN);

// Register Todoist tools with the MCP Server
export function registerTodoistTools(server: McpServer) {
  // Create task tool
  server.tool(
    "todoist_create_task",
    "A tool to create a new task in Todoist with customizable content, description, due date, and priority",
    {
      content: z.string().describe("The content/title of the task"),
      description: z
        .string()
        .optional()
        .describe("Detailed description of the task (optional)"),
      due_string: z
        .string()
        .optional()
        .describe(
          "Natural language due date like 'tomorrow', 'next Monday', 'Jan 23' (optional)"
        ),
      priority: z
        .enum(["1", "2", "3", "4"])
        .optional()
        .describe("Task priority from 1 (normal) to 4 (urgent) (optional)"),
    },
    async ({ content, description, due_string, priority }) => {
      try {
        const task = await todoistClient.addTask({
          content,
          description,
          dueString: due_string,
          priority: priority ? parseInt(priority) : undefined,
        });

        return {
          content: [
            {
              type: "text",
              text: `Task created:\nTitle: ${task.content}${
                task.description ? `\nDescription: ${task.description}` : ""
              }${task.due ? `\nDue: ${task.due.string}` : ""}${
                task.priority ? `\nPriority: ${task.priority}` : ""
              }`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating task: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Get tasks tool
  server.tool(
    "todoist_get_tasks",
    "A tool to retrieve and filter Todoist tasks by project, due date, priority, and other criteria",
    {
      project_id: z
        .string()
        .optional()
        .describe("Filter tasks by project ID (optional)"),
      filter: z
        .string()
        .optional()
        .describe(
          "Natural language filter like 'today', 'tomorrow', 'next week', 'priority 1', 'overdue' (optional)"
        ),
      priority: z
        .enum(["1", "2", "3", "4"])
        .optional()
        .describe("Filter by priority level (1-4) (optional)"),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe("Maximum number of tasks to return (optional)"),
    },
    async ({ project_id, filter, priority, limit }) => {
      try {
        // Only pass filter if at least one filtering parameter is provided
        const apiParams: any = {};
        if (project_id) {
          apiParams.projectId = project_id;
        }
        if (filter) {
          apiParams.filter = filter;
        }

        // If no filters provided, default to showing all tasks
        const tasks = (
          await todoistClient.getTasks(
            Object.keys(apiParams).length > 0 ? apiParams : undefined
          )
        ).results;

        // Apply additional filters
        let filteredTasks = tasks;
        if (priority) {
          filteredTasks = filteredTasks.filter(
            (task) => task.priority === parseInt(priority)
          );
        }

        // Apply limit
        if (limit && limit > 0) {
          filteredTasks = filteredTasks.slice(0, limit);
        }

        const taskList = filteredTasks
          .map(
            (task) =>
              `- ${task.content}${
                task.description ? `\n  Description: ${task.description}` : ""
              }${task.due ? `\n  Due: ${task.due.string}` : ""}${
                task.priority ? `\n  Priority: ${task.priority}` : ""
              }`
          )
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text:
                filteredTasks.length > 0
                  ? taskList
                  : "No tasks found matching the criteria",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting tasks: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Update task tool
  server.tool(
    "todoist_update_task",
    "A tool to update an existing Todoist task by name, modifying its content, description, due date, or priority",
    {
      task_name: z
        .string()
        .describe("Name/content of the task to search for and update"),
      content: z
        .string()
        .optional()
        .describe("New content/title for the task (optional)"),
      description: z
        .string()
        .optional()
        .describe("New description for the task (optional)"),
      due_string: z
        .string()
        .optional()
        .describe(
          "New due date in natural language like 'tomorrow', 'next Monday' (optional)"
        ),
      priority: z
        .enum(["1", "2", "3", "4"])
        .optional()
        .describe(
          "New priority level from 1 (normal) to 4 (urgent) (optional)"
        ),
    },
    async ({ task_name, content, description, due_string, priority }) => {
      try {
        // First, search for the task
        const tasks = (await todoistClient.getTasks()).results;
        const matchingTask = tasks.find((task) =>
          task.content.toLowerCase().includes(task_name.toLowerCase())
        );

        if (!matchingTask) {
          return {
            content: [
              {
                type: "text",
                text: `Could not find a task matching "${task_name}"`,
              },
            ],
            isError: true,
          };
        }

        // Build update data
        const updateData: any = {};
        if (content) updateData.content = content;
        if (description) updateData.description = description;
        if (due_string) updateData.dueString = due_string;
        if (priority) updateData.priority = parseInt(priority);

        const updatedTask = await todoistClient.updateTask(
          matchingTask.id,
          updateData
        );

        return {
          content: [
            {
              type: "text",
              text: `Task "${matchingTask.content}" updated:\nNew Title: ${
                updatedTask.content
              }${
                updatedTask.description
                  ? `\nNew Description: ${updatedTask.description}`
                  : ""
              }${
                updatedTask.due
                  ? `\nNew Due Date: ${updatedTask.due.string}`
                  : ""
              }${
                updatedTask.priority
                  ? `\nNew Priority: ${updatedTask.priority}`
                  : ""
              }`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error updating task: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Delete task tool
  server.tool(
    "todoist_delete_task",
    "A tool to delete a Todoist task by searching for its name",
    {
      task_name: z
        .string()
        .describe("Name/content of the task to search for and delete"),
    },
    async ({ task_name }) => {
      try {
        // First, search for the task
        const tasks = (await todoistClient.getTasks()).results;
        const matchingTask = tasks.find((task) =>
          task.content.toLowerCase().includes(task_name.toLowerCase())
        );

        if (!matchingTask) {
          return {
            content: [
              {
                type: "text",
                text: `Could not find a task matching "${task_name}"`,
              },
            ],
            isError: true,
          };
        }

        // Delete the task
        await todoistClient.deleteTask(matchingTask.id);

        return {
          content: [
            {
              type: "text",
              text: `Successfully deleted task: "${matchingTask.content}"`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error deleting task: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Complete task tool
  server.tool(
    "todoist_complete_task",
    "A tool to mark a Todoist task as complete by searching for its name",
    {
      task_name: z
        .string()
        .describe("Name/content of the task to search for and complete"),
    },
    async ({ task_name }) => {
      try {
        // First, search for the task
        const tasks = (await todoistClient.getTasks()).results;
        const matchingTask = tasks.find((task) =>
          task.content.toLowerCase().includes(task_name.toLowerCase())
        );

        if (!matchingTask) {
          return {
            content: [
              {
                type: "text",
                text: `Could not find a task matching "${task_name}"`,
              },
            ],
            isError: true,
          };
        }

        // Complete the task
        await todoistClient.closeTask(matchingTask.id);

        return {
          content: [
            {
              type: "text",
              text: `Successfully completed task: "${matchingTask.content}"`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error completing task: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
