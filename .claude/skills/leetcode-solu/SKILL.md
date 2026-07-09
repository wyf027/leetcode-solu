```markdown
# leetcode-solu Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill outlines the development patterns and workflows used in the `leetcode-solu` repository, a Python codebase focused on algorithmic problem solving. It documents the project's coding conventions, commit patterns, and established workflows for adding new features or demo pages, ensuring consistency and ease of collaboration.

## Coding Conventions

### File Naming
- **Pattern:** PascalCase
- **Example:**  
  ```
  TwoSum.py
  LongestSubstring.py
  ```

### Import Style
- **Pattern:** Relative imports
- **Example:**
  ```python
  from .HelperFunctions import parse_input
  ```

### Export Style
- **Pattern:** Named exports (explicit function/class definitions)
- **Example:**
  ```python
  def two_sum(nums, target):
      ...
  ```

### Commit Patterns
- **Type:** Conventional commits
- **Prefixes:** `feat`, `chore`
- **Example:**
  ```
  feat: add solution for TwoSum
  chore: update README with new problems
  ```

## Workflows

### Add Static Demo Page
**Trigger:** When someone wants to demonstrate or prototype a new feature or plugin with a standalone HTML page.  
**Command:** `/new-demo-page`

1. **Create a new directory** under `project/` with a descriptive name for the demo or feature.
2. **Add an `index.html` file** (or multiple `.html` files) to serve as the demo page.
3. **Optionally add supporting files** such as:
   - `README.md` for documentation
   - JavaScript files (`.js`) for interactivity
   - CSS files (`.css`) for styling
4. **Example directory structure:**
    ```
    project/my-feature-demo/
      ├── index.html
      ├── script.js
      ├── styles.css
      └── README.md
    ```

## Testing Patterns

- **Framework:** Unknown (no explicit framework detected)
- **File Pattern:** Test files are named using the `*.test.*` pattern.
- **Example:**
  ```
  TwoSum.test.py
  ```
- **Typical test structure:**
  ```python
  import unittest
  from .TwoSum import two_sum

  class TestTwoSum(unittest.TestCase):
      def test_example(self):
          self.assertEqual(two_sum([2,7,11,15], 9), [0,1])
  ```

## Commands

| Command         | Purpose                                                     |
|-----------------|-------------------------------------------------------------|
| /new-demo-page  | Scaffold a new static demo page under `project/` directory. |
```
