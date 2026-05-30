import { expect, test } from "bun:test"
import { loadExecutionBenchmarkTasks, runExecutionBenchmarkSuite } from "./execution-benchmark"

test("loadExecutionBenchmarkTasks discovers fixture manifests", async () => {
  const tasks = await loadExecutionBenchmarkTasks()

  expect(tasks.map((task) => task.id)).toContain("login-validation")
  expect(tasks.find((task) => task.id === "login-validation")?.expected.changedFiles).toEqual(["src/login.ts"])
})

test("runExecutionBenchmarkSuite executes mock fixtures and reports patch checks review metrics", async () => {
  const result = await runExecutionBenchmarkSuite({
    mode: "mock",
    taskIds: ["failing-test-fix", "security-review-only"],
  })

  expect(result.summary.totalTasks).toBe(2)
  expect(result.summary.failedTasks).toBe(0)

  const failingTest = result.results.find((item) => item.task.id === "failing-test-fix")
  expect(failingTest?.status).toBe("passed")
  expect(failingTest?.metrics.changedFiles).toEqual(["src/math.ts"])
  expect(failingTest?.metrics.checksStatus).toBe("passed")
  expect(failingTest?.metrics.reviewDecision).toBe("approved")

  const reviewOnly = result.results.find((item) => item.task.id === "security-review-only")
  expect(reviewOnly?.status).toBe("passed")
  expect(reviewOnly?.metrics.changedFiles).toEqual([])
  expect(reviewOnly?.metrics.checksStatus).toBe("not-run")
  expect(reviewOnly?.metrics.reviewDecision).toBe("not-run")
})
