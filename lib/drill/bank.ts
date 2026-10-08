import type { CodeLanguage, Difficulty, Signature, TestCase } from "@/lib/domain/drill";

/**
 * F26 — the curated DSA bank.
 *
 * Classic interview problems, hand-written and hand-checked: every reference
 * solution here passes every test below (`pnpm check:drill` re-runs the
 * JavaScript and Python ones). A bank challenge costs zero tokens to start —
 * the model is only asked to review a submission.
 *
 * Statements are our own wording of well-known problems; no text is copied
 * from any judge site.
 */

export interface BankProblem {
  slug: string;
  title: string;
  difficulty: Difficulty;
  topic: string;
  statement: string;
  constraints: string[];
  examples: { input: string; output: string; explanation: string }[];
  signature: Signature;
  tests: TestCase[];
  hints: [string, string, string];
  approach: string;
  optimalTime: string;
  optimalSpace: string;
  solutions: Record<CodeLanguage, string>;
}

export const BANK: BankProblem[] = [
  /* ------------------------------------------------------------------ easy */
  {
    slug: "two-sum",
    title: "Two Sum",
    difficulty: "easy",
    topic: "Hashing",
    statement:
      "Given an array of integers `nums` and an integer `target`, return the indices of the two numbers that add up to `target`, smaller index first. Exactly one valid pair exists, and you may not use the same element twice.",
    constraints: ["2 ≤ nums.length ≤ 10⁴", "-10⁹ ≤ nums[i], target ≤ 10⁹", "Exactly one answer exists"],
    examples: [
      { input: "nums = [2,7,11,15], target = 9", output: "[0,1]", explanation: "2 + 7 = 9." },
      { input: "nums = [3,2,4], target = 6", output: "[1,2]", explanation: "2 + 4 = 6." },
    ],
    signature: {
      functionName: "twoSum",
      params: [
        { name: "nums", type: "int[]" },
        { name: "target", type: "int" },
      ],
      returnType: "int[]",
    },
    tests: [
      { args: "[[2,7,11,15],9]", expected: "[0,1]" },
      { args: "[[3,2,4],6]", expected: "[1,2]" },
      { args: "[[3,3],6]", expected: "[0,1]" },
      { args: "[[-1,-2,-3,-4,-5],-8]", expected: "[2,4]" },
      { args: "[[0,4,3,0],0]", expected: "[0,3]" },
      { args: "[[1,5,9,13,2],15]", expected: "[3,4]" },
    ],
    hints: [
      "The brute force checks every pair — O(n²). What would let you check a single number in O(1)?",
      "For each number x, the partner you need is target − x. Have you seen it already?",
      "Keep a map from value → index as you scan. Look up target − x before inserting x.",
    ],
    approach:
      "One pass with a hash map from value to index. For each element, if its complement (target − x) is already in the map, the pair is found; otherwise record x. Each lookup is O(1) on average.",
    optimalTime: "O(n)",
    optimalSpace: "O(n)",
    solutions: {
      javascript: `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(nums[i], i);
  }
  return [];
}`,
      python: `def two_sum(nums: list[int], target: int) -> list[int]:
    seen = {}
    for i, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], i]
        seen[x] = i
    return []`,
      java: `class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            Integer j = seen.get(target - nums[i]);
            if (j != null) return new int[]{j, i};
            seen.put(nums[i], i);
        }
        return new int[0];
    }
}`,
      cpp: `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> seen;
        for (int i = 0; i < (int)nums.size(); i++) {
            auto it = seen.find(target - nums[i]);
            if (it != seen.end()) return {it->second, i};
            seen[nums[i]] = i;
        }
        return {};
    }
};`,
    },
  },
  {
    slug: "valid-parentheses",
    title: "Valid Parentheses",
    difficulty: "easy",
    topic: "Stacks",
    statement:
      "Given a string `s` of the characters `()[]{}`, return true if every opening bracket is closed by the same type of bracket, in the correct order.",
    constraints: ["1 ≤ s.length ≤ 10⁴", "s contains only ()[]{}"],
    examples: [
      { input: 's = "()[]{}"', output: "true", explanation: "Each pair closes in order." },
      { input: 's = "(]"', output: "false", explanation: "A round bracket is closed by a square one." },
    ],
    signature: {
      functionName: "isValid",
      params: [{ name: "s", type: "string" }],
      returnType: "bool",
    },
    tests: [
      { args: '["()"]', expected: "true" },
      { args: '["()[]{}"]', expected: "true" },
      { args: '["(]"]', expected: "false" },
      { args: '["([)]"]', expected: "false" },
      { args: '["{[]}"]', expected: "true" },
      { args: '["(("]', expected: "false" },
      { args: '["]"]', expected: "false" },
    ],
    hints: [
      "The most recently opened bracket must be the first one closed. Which data structure gives you 'most recent first'?",
      "Push every opener. On a closer, the top of the stack must be its partner.",
      "Don't forget the two edge cases: a closer with an empty stack, and openers left over at the end.",
    ],
    approach:
      "Scan once with a stack. Push opening brackets; on a closing bracket, pop and check it matches. The string is valid when every closer matched and the stack ends empty.",
    optimalTime: "O(n)",
    optimalSpace: "O(n)",
    solutions: {
      javascript: `function isValid(s) {
  const pair = { ")": "(", "]": "[", "}": "{" };
  const stack = [];
  for (const c of s) {
    if (c in pair) {
      if (stack.pop() !== pair[c]) return false;
    } else stack.push(c);
  }
  return stack.length === 0;
}`,
      python: `def is_valid(s: str) -> bool:
    pair = {")": "(", "]": "[", "}": "{"}
    stack = []
    for c in s:
        if c in pair:
            if not stack or stack.pop() != pair[c]:
                return False
        else:
            stack.append(c)
    return not stack`,
      java: `class Solution {
    public boolean isValid(String s) {
        Deque<Character> stack = new ArrayDeque<>();
        for (char c : s.toCharArray()) {
            if (c == '(' || c == '[' || c == '{') stack.push(c);
            else {
                if (stack.isEmpty()) return false;
                char o = stack.pop();
                if ((c == ')' && o != '(') || (c == ']' && o != '[') || (c == '}' && o != '{')) return false;
            }
        }
        return stack.isEmpty();
    }
}`,
      cpp: `class Solution {
public:
    bool isValid(string& s) {
        stack<char> st;
        for (char c : s) {
            if (c == '(' || c == '[' || c == '{') st.push(c);
            else {
                if (st.empty()) return false;
                char o = st.top(); st.pop();
                if ((c == ')' && o != '(') || (c == ']' && o != '[') || (c == '}' && o != '{')) return false;
            }
        }
        return st.empty();
    }
};`,
    },
  },
  {
    slug: "best-time-stock",
    title: "Best Time to Buy and Sell Stock",
    difficulty: "easy",
    topic: "Arrays",
    statement:
      "`prices[i]` is a stock's price on day i. Choose one day to buy and a later day to sell. Return the maximum profit, or 0 if no profit is possible.",
    constraints: ["1 ≤ prices.length ≤ 10⁵", "0 ≤ prices[i] ≤ 10⁴"],
    examples: [
      { input: "prices = [7,1,5,3,6,4]", output: "5", explanation: "Buy at 1 (day 1), sell at 6 (day 4)." },
      { input: "prices = [7,6,4,3,1]", output: "0", explanation: "Prices only fall." },
    ],
    signature: {
      functionName: "maxProfit",
      params: [{ name: "prices", type: "int[]" }],
      returnType: "int",
    },
    tests: [
      { args: "[[7,1,5,3,6,4]]", expected: "5" },
      { args: "[[7,6,4,3,1]]", expected: "0" },
      { args: "[[1]]", expected: "0" },
      { args: "[[2,4,1]]", expected: "2" },
      { args: "[[3,2,6,5,0,3]]", expected: "4" },
      { args: "[[1,2,3,4,5]]", expected: "4" },
    ],
    hints: [
      "For any sell day, the best buy day is simply the cheapest day before it.",
      "Track the minimum price seen so far as you walk left to right.",
      "At each day, profit = price − minSoFar. Keep the best one.",
    ],
    approach:
      "Single pass keeping the lowest price seen so far and the best profit. Each day either lowers the minimum or offers a candidate profit against it.",
    optimalTime: "O(n)",
    optimalSpace: "O(1)",
    solutions: {
      javascript: `function maxProfit(prices) {
  let low = Infinity, best = 0;
  for (const p of prices) {
    low = Math.min(low, p);
    best = Math.max(best, p - low);
  }
  return best;
}`,
      python: `def max_profit(prices: list[int]) -> int:
    low, best = float("inf"), 0
    for p in prices:
        low = min(low, p)
        best = max(best, p - low)
    return best`,
      java: `class Solution {
    public int maxProfit(int[] prices) {
        int low = Integer.MAX_VALUE, best = 0;
        for (int p : prices) {
            low = Math.min(low, p);
            best = Math.max(best, p - low);
        }
        return best;
    }
}`,
      cpp: `class Solution {
public:
    int maxProfit(vector<int>& prices) {
        int low = INT_MAX, best = 0;
        for (int p : prices) {
            low = min(low, p);
            best = max(best, p - low);
        }
        return best;
    }
};`,
    },
  },
  {
    slug: "binary-search",
    title: "Binary Search",
    difficulty: "easy",
    topic: "Binary search",
    statement:
      "Given a sorted array of distinct integers `nums` and a `target`, return the index of `target`, or -1 if it is absent. Your solution must run in O(log n).",
    constraints: ["1 ≤ nums.length ≤ 10⁴", "nums is sorted ascending and distinct"],
    examples: [
      { input: "nums = [-1,0,3,5,9,12], target = 9", output: "4", explanation: "9 is at index 4." },
      { input: "nums = [-1,0,3,5,9,12], target = 2", output: "-1", explanation: "2 is not present." },
    ],
    signature: {
      functionName: "search",
      params: [
        { name: "nums", type: "int[]" },
        { name: "target", type: "int" },
      ],
      returnType: "int",
    },
    tests: [
      { args: "[[-1,0,3,5,9,12],9]", expected: "4" },
      { args: "[[-1,0,3,5,9,12],2]", expected: "-1" },
      { args: "[[5],5]", expected: "0" },
      { args: "[[5],-5]", expected: "-1" },
      { args: "[[1,3,5,7,9,11],1]", expected: "0" },
      { args: "[[1,3,5,7,9,11],11]", expected: "5" },
    ],
    hints: [
      "Compare the target with the middle element. What does that tell you about each half?",
      "Keep two pointers lo and hi and shrink the window by half each step.",
      "Loop while lo ≤ hi; mid = lo + ((hi − lo) >> 1) avoids overflow in fixed-width languages.",
    ],
    approach:
      "Classic binary search on a closed interval [lo, hi]. Each comparison discards half the remaining range.",
    optimalTime: "O(log n)",
    optimalSpace: "O(1)",
    solutions: {
      javascript: `function search(nums, target) {
  let lo = 0, hi = nums.length - 1;
  while (lo <= hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (nums[mid] === target) return mid;
    if (nums[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}`,
      python: `def search(nums: list[int], target: int) -> int:
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1`,
      java: `class Solution {
    public int search(int[] nums, int target) {
        int lo = 0, hi = nums.length - 1;
        while (lo <= hi) {
            int mid = lo + ((hi - lo) >> 1);
            if (nums[mid] == target) return mid;
            if (nums[mid] < target) lo = mid + 1; else hi = mid - 1;
        }
        return -1;
    }
}`,
      cpp: `class Solution {
public:
    int search(vector<int>& nums, int target) {
        int lo = 0, hi = (int)nums.size() - 1;
        while (lo <= hi) {
            int mid = lo + ((hi - lo) >> 1);
            if (nums[mid] == target) return mid;
            if (nums[mid] < target) lo = mid + 1; else hi = mid - 1;
        }
        return -1;
    }
};`,
    },
  },

  /* ---------------------------------------------------------------- medium */
  {
    slug: "longest-substring",
    title: "Longest Substring Without Repeating Characters",
    difficulty: "medium",
    topic: "Sliding window",
    statement: "Given a string `s`, return the length of the longest substring that contains no repeated character.",
    constraints: ["0 ≤ s.length ≤ 5·10⁴", "s may contain letters, digits, symbols and spaces"],
    examples: [
      { input: 's = "abcabcbb"', output: "3", explanation: '"abc" is the longest.' },
      { input: 's = "pwwkew"', output: "3", explanation: '"wke" — a substring, not a subsequence.' },
    ],
    signature: {
      functionName: "lengthOfLongestSubstring",
      params: [{ name: "s", type: "string" }],
      returnType: "int",
    },
    tests: [
      { args: '["abcabcbb"]', expected: "3" },
      { args: '["bbbbb"]', expected: "1" },
      { args: '["pwwkew"]', expected: "3" },
      { args: '[""]', expected: "0" },
      { args: '["dvdf"]', expected: "3" },
      { args: '["abba"]', expected: "2" },
      { args: '["tmmzuxt"]', expected: "5" },
    ],
    hints: [
      "Think of a window [left, right] that always holds distinct characters.",
      "When s[right] is already in the window, move left past its previous occurrence.",
      "Store each character's last index in a map; left = max(left, last[c] + 1) — the max matters (try \"abba\").",
    ],
    approach:
      "Sliding window with a map of each character's last index. Extend right one step at a time; when the new character was seen inside the window, jump left past it. The window length at each step is a candidate.",
    optimalTime: "O(n)",
    optimalSpace: "O(min(n, alphabet))",
    solutions: {
      javascript: `function lengthOfLongestSubstring(s) {
  const last = new Map();
  let left = 0, best = 0;
  for (let right = 0; right < s.length; right++) {
    const c = s[right];
    if (last.has(c)) left = Math.max(left, last.get(c) + 1);
    last.set(c, right);
    best = Math.max(best, right - left + 1);
  }
  return best;
}`,
      python: `def length_of_longest_substring(s: str) -> int:
    last = {}
    left = best = 0
    for right, c in enumerate(s):
        if c in last:
            left = max(left, last[c] + 1)
        last[c] = right
        best = max(best, right - left + 1)
    return best`,
      java: `class Solution {
    public int lengthOfLongestSubstring(String s) {
        Map<Character, Integer> last = new HashMap<>();
        int left = 0, best = 0;
        for (int right = 0; right < s.length(); right++) {
            char c = s.charAt(right);
            if (last.containsKey(c)) left = Math.max(left, last.get(c) + 1);
            last.put(c, right);
            best = Math.max(best, right - left + 1);
        }
        return best;
    }
}`,
      cpp: `class Solution {
public:
    int lengthOfLongestSubstring(string& s) {
        unordered_map<char, int> last;
        int left = 0, best = 0;
        for (int right = 0; right < (int)s.size(); right++) {
            auto it = last.find(s[right]);
            if (it != last.end()) left = max(left, it->second + 1);
            last[s[right]] = right;
            best = max(best, right - left + 1);
        }
        return best;
    }
};`,
    },
  },
  {
    slug: "product-except-self",
    title: "Product of Array Except Self",
    difficulty: "medium",
    topic: "Prefix sums",
    statement:
      "Given an integer array `nums`, return an array `answer` where `answer[i]` is the product of every element except `nums[i]`. Do it in O(n) without using division.",
    constraints: ["2 ≤ nums.length ≤ 10⁵", "-30 ≤ nums[i] ≤ 30", "Every prefix and suffix product fits in a 32-bit integer"],
    examples: [
      { input: "nums = [1,2,3,4]", output: "[24,12,8,6]", explanation: "e.g. 24 = 2·3·4." },
      { input: "nums = [-1,1,0,-3,3]", output: "[0,0,9,0,0]", explanation: "Only the zero's slot is non-zero." },
    ],
    signature: {
      functionName: "productExceptSelf",
      params: [{ name: "nums", type: "int[]" }],
      returnType: "int[]",
    },
    tests: [
      { args: "[[1,2,3,4]]", expected: "[24,12,8,6]" },
      { args: "[[-1,1,0,-3,3]]", expected: "[0,0,9,0,0]" },
      { args: "[[2,3]]", expected: "[3,2]" },
      { args: "[[0,0]]", expected: "[0,0]" },
      { args: "[[5,1,1,2]]", expected: "[2,10,10,5]" },
    ],
    hints: [
      "answer[i] = (product of everything left of i) × (product of everything right of i).",
      "Build the left products in one pass into the output array.",
      "Then sweep right-to-left with a running suffix product, multiplying it in — no extra array needed.",
    ],
    approach:
      "Two passes. First fill answer[i] with the product of all elements before i. Then walk backwards with a running product of elements after i and multiply it into answer[i].",
    optimalTime: "O(n)",
    optimalSpace: "O(1) extra",
    solutions: {
      javascript: `function productExceptSelf(nums) {
  const n = nums.length, out = new Array(n).fill(1);
  for (let i = 1; i < n; i++) out[i] = out[i - 1] * nums[i - 1];
  let right = 1;
  for (let i = n - 1; i >= 0; i--) {
    out[i] *= right;
    right *= nums[i];
  }
  return out;
}`,
      python: `def product_except_self(nums: list[int]) -> list[int]:
    n = len(nums)
    out = [1] * n
    for i in range(1, n):
        out[i] = out[i - 1] * nums[i - 1]
    right = 1
    for i in range(n - 1, -1, -1):
        out[i] *= right
        right *= nums[i]
    return out`,
      java: `class Solution {
    public int[] productExceptSelf(int[] nums) {
        int n = nums.length;
        int[] out = new int[n];
        out[0] = 1;
        for (int i = 1; i < n; i++) out[i] = out[i - 1] * nums[i - 1];
        int right = 1;
        for (int i = n - 1; i >= 0; i--) {
            out[i] *= right;
            right *= nums[i];
        }
        return out;
    }
}`,
      cpp: `class Solution {
public:
    vector<int> productExceptSelf(vector<int>& nums) {
        int n = nums.size();
        vector<int> out(n, 1);
        for (int i = 1; i < n; i++) out[i] = out[i - 1] * nums[i - 1];
        int right = 1;
        for (int i = n - 1; i >= 0; i--) {
            out[i] *= right;
            right *= nums[i];
        }
        return out;
    }
};`,
    },
  },
  {
    slug: "number-of-islands",
    title: "Number of Islands",
    difficulty: "medium",
    topic: "Graphs (BFS/DFS)",
    statement:
      "Given a grid of 1s (land) and 0s (water), return the number of islands. An island is land connected horizontally or vertically, surrounded by water. The grid's outside is water.",
    constraints: ["1 ≤ rows, cols ≤ 300", "grid[i][j] is 0 or 1"],
    examples: [
      {
        input: "grid = [[1,1,0,0],[1,1,0,0],[0,0,1,0],[0,0,0,1]]",
        output: "3",
        explanation: "One 2×2 block and two single cells.",
      },
    ],
    signature: {
      functionName: "numIslands",
      params: [{ name: "grid", type: "int[][]" }],
      returnType: "int",
    },
    tests: [
      { args: "[[[1,1,0,0],[1,1,0,0],[0,0,1,0],[0,0,0,1]]]", expected: "3" },
      { args: "[[[1,1,1],[0,1,0],[1,1,1]]]", expected: "1" },
      { args: "[[[0]]]", expected: "0" },
      { args: "[[[1]]]", expected: "1" },
      { args: "[[[1,0,1,0,1]]]", expected: "3" },
      { args: "[[[1,0],[0,1]]]", expected: "2" },
    ],
    hints: [
      "Every unvisited land cell you find starts a new island.",
      "From that cell, flood-fill (DFS or BFS) to mark the whole island visited.",
      "You can mark visited by setting the cell to 0 — or keep a separate visited set if you must not mutate input.",
    ],
    approach:
      "Scan every cell. On unvisited land, increment the count and flood-fill its connected land with BFS or DFS so it is never counted again. Each cell is visited a constant number of times.",
    optimalTime: "O(rows·cols)",
    optimalSpace: "O(rows·cols)",
    solutions: {
      javascript: `function numIslands(grid) {
  const R = grid.length, C = grid[0].length;
  let count = 0;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (grid[r][c] !== 1) continue;
      count++;
      const stack = [[r, c]];
      grid[r][c] = 0;
      while (stack.length) {
        const [y, x] = stack.pop();
        for (const [dy, dx] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const ny = y + dy, nx = x + dx;
          if (ny >= 0 && ny < R && nx >= 0 && nx < C && grid[ny][nx] === 1) {
            grid[ny][nx] = 0;
            stack.push([ny, nx]);
          }
        }
      }
    }
  }
  return count;
}`,
      python: `def num_islands(grid: list[list[int]]) -> int:
    R, C = len(grid), len(grid[0])
    count = 0
    for r in range(R):
        for c in range(C):
            if grid[r][c] != 1:
                continue
            count += 1
            stack = [(r, c)]
            grid[r][c] = 0
            while stack:
                y, x = stack.pop()
                for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= ny < R and 0 <= nx < C and grid[ny][nx] == 1:
                        grid[ny][nx] = 0
                        stack.append((ny, nx))
    return count`,
      java: `class Solution {
    public int numIslands(int[][] grid) {
        int R = grid.length, C = grid[0].length, count = 0;
        int[][] dirs = {{1,0},{-1,0},{0,1},{0,-1}};
        for (int r = 0; r < R; r++) for (int c = 0; c < C; c++) {
            if (grid[r][c] != 1) continue;
            count++;
            Deque<int[]> stack = new ArrayDeque<>();
            stack.push(new int[]{r, c});
            grid[r][c] = 0;
            while (!stack.isEmpty()) {
                int[] p = stack.pop();
                for (int[] d : dirs) {
                    int y = p[0] + d[0], x = p[1] + d[1];
                    if (y >= 0 && y < R && x >= 0 && x < C && grid[y][x] == 1) {
                        grid[y][x] = 0;
                        stack.push(new int[]{y, x});
                    }
                }
            }
        }
        return count;
    }
}`,
      cpp: `class Solution {
public:
    int numIslands(vector<vector<int>>& grid) {
        int R = grid.size(), C = grid[0].size(), count = 0;
        int dirs[4][2] = {{1,0},{-1,0},{0,1},{0,-1}};
        for (int r = 0; r < R; r++) for (int c = 0; c < C; c++) {
            if (grid[r][c] != 1) continue;
            count++;
            vector<pair<int,int>> st{{r, c}};
            grid[r][c] = 0;
            while (!st.empty()) {
                auto [y, x] = st.back(); st.pop_back();
                for (auto& d : dirs) {
                    int ny = y + d[0], nx = x + d[1];
                    if (ny >= 0 && ny < R && nx >= 0 && nx < C && grid[ny][nx] == 1) {
                        grid[ny][nx] = 0;
                        st.push_back({ny, nx});
                    }
                }
            }
        }
        return count;
    }
};`,
    },
  },
  {
    slug: "coin-change",
    title: "Coin Change",
    difficulty: "medium",
    topic: "Dynamic programming",
    statement:
      "Given coin denominations `coins` and a total `amount`, return the fewest coins that make up `amount`, or -1 if it cannot be made. You have unlimited coins of each kind.",
    constraints: ["1 ≤ coins.length ≤ 12", "1 ≤ coins[i] ≤ 2³¹ − 1", "0 ≤ amount ≤ 10⁴"],
    examples: [
      { input: "coins = [1,2,5], amount = 11", output: "3", explanation: "5 + 5 + 1." },
      { input: "coins = [2], amount = 3", output: "-1", explanation: "3 cannot be made from 2s." },
    ],
    signature: {
      functionName: "coinChange",
      params: [
        { name: "coins", type: "int[]" },
        { name: "amount", type: "int" },
      ],
      returnType: "int",
    },
    tests: [
      { args: "[[1,2,5],11]", expected: "3" },
      { args: "[[2],3]", expected: "-1" },
      { args: "[[1],0]", expected: "0" },
      { args: "[[1,3,4],6]", expected: "2" },
      { args: "[[186,419,83,408],6249]", expected: "20" },
      { args: "[[2,5,10,1],27]", expected: "4" },
    ],
    hints: [
      "Greedy (largest coin first) fails — try coins [1,3,4] for amount 6.",
      "Let dp[a] be the fewest coins for amount a. How does dp[a] relate to smaller amounts?",
      "dp[a] = 1 + min(dp[a − c]) over every coin c ≤ a, with dp[0] = 0 and 'unreachable' as infinity.",
    ],
    approach:
      "Bottom-up DP over amounts 0..amount. dp[0] = 0; each dp[a] takes the best dp[a − c] + 1 over all coins. An amount still at infinity at the end is unreachable.",
    optimalTime: "O(amount·coins)",
    optimalSpace: "O(amount)",
    solutions: {
      javascript: `function coinChange(coins, amount) {
  const dp = new Array(amount + 1).fill(Infinity);
  dp[0] = 0;
  for (let a = 1; a <= amount; a++) {
    for (const c of coins) if (c <= a && dp[a - c] + 1 < dp[a]) dp[a] = dp[a - c] + 1;
  }
  return dp[amount] === Infinity ? -1 : dp[amount];
}`,
      python: `def coin_change(coins: list[int], amount: int) -> int:
    INF = float("inf")
    dp = [0] + [INF] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a and dp[a - c] + 1 < dp[a]:
                dp[a] = dp[a - c] + 1
    return -1 if dp[amount] == INF else dp[amount]`,
      java: `class Solution {
    public int coinChange(int[] coins, int amount) {
        int[] dp = new int[amount + 1];
        Arrays.fill(dp, Integer.MAX_VALUE);
        dp[0] = 0;
        for (int a = 1; a <= amount; a++)
            for (int c : coins)
                if (c <= a && dp[a - c] != Integer.MAX_VALUE) dp[a] = Math.min(dp[a], dp[a - c] + 1);
        return dp[amount] == Integer.MAX_VALUE ? -1 : dp[amount];
    }
}`,
      cpp: `class Solution {
public:
    int coinChange(vector<int>& coins, int amount) {
        vector<int> dp(amount + 1, INT_MAX);
        dp[0] = 0;
        for (int a = 1; a <= amount; a++)
            for (int c : coins)
                if (c <= a && dp[a - c] != INT_MAX) dp[a] = min(dp[a], dp[a - c] + 1);
        return dp[amount] == INT_MAX ? -1 : dp[amount];
    }
};`,
    },
  },

  /* ------------------------------------------------------------------ hard */
  {
    slug: "trapping-rain-water",
    title: "Trapping Rain Water",
    difficulty: "hard",
    topic: "Two pointers",
    statement:
      "`height[i]` is the height of a bar of width 1. Return how many units of rain water are trapped between the bars after it rains.",
    constraints: ["1 ≤ height.length ≤ 2·10⁴", "0 ≤ height[i] ≤ 10⁵"],
    examples: [
      { input: "height = [0,1,0,2,1,0,1,3,2,1,2,1]", output: "6", explanation: "Six unit cells hold water." },
      { input: "height = [4,2,0,3,2,5]", output: "9", explanation: "" },
    ],
    signature: {
      functionName: "trap",
      params: [{ name: "height", type: "int[]" }],
      returnType: "int",
    },
    tests: [
      { args: "[[0,1,0,2,1,0,1,3,2,1,2,1]]", expected: "6" },
      { args: "[[4,2,0,3,2,5]]", expected: "9" },
      { args: "[[1]]", expected: "0" },
      { args: "[[3,0,3]]", expected: "3" },
      { args: "[[5,4,3,2,1]]", expected: "0" },
      { args: "[[2,0,2,0,2]]", expected: "4" },
    ],
    hints: [
      "Water above bar i = min(tallest bar to its left, tallest to its right) − height[i].",
      "Prefix-max and suffix-max arrays give O(n) time with O(n) space. Can you drop the arrays?",
      "Two pointers from both ends: always move the side with the smaller max — that side's water is already decided.",
    ],
    approach:
      "Two pointers with running leftMax and rightMax. Whichever side has the smaller max is bounded by it, so add max − height there and move that pointer inward.",
    optimalTime: "O(n)",
    optimalSpace: "O(1)",
    solutions: {
      javascript: `function trap(height) {
  let l = 0, r = height.length - 1, lMax = 0, rMax = 0, water = 0;
  while (l < r) {
    if (height[l] < height[r]) {
      lMax = Math.max(lMax, height[l]);
      water += lMax - height[l++];
    } else {
      rMax = Math.max(rMax, height[r]);
      water += rMax - height[r--];
    }
  }
  return water;
}`,
      python: `def trap(height: list[int]) -> int:
    l, r = 0, len(height) - 1
    l_max = r_max = water = 0
    while l < r:
        if height[l] < height[r]:
            l_max = max(l_max, height[l])
            water += l_max - height[l]
            l += 1
        else:
            r_max = max(r_max, height[r])
            water += r_max - height[r]
            r -= 1
    return water`,
      java: `class Solution {
    public int trap(int[] height) {
        int l = 0, r = height.length - 1, lMax = 0, rMax = 0, water = 0;
        while (l < r) {
            if (height[l] < height[r]) { lMax = Math.max(lMax, height[l]); water += lMax - height[l++]; }
            else { rMax = Math.max(rMax, height[r]); water += rMax - height[r--]; }
        }
        return water;
    }
}`,
      cpp: `class Solution {
public:
    int trap(vector<int>& height) {
        int l = 0, r = (int)height.size() - 1, lMax = 0, rMax = 0, water = 0;
        while (l < r) {
            if (height[l] < height[r]) { lMax = max(lMax, height[l]); water += lMax - height[l++]; }
            else { rMax = max(rMax, height[r]); water += rMax - height[r--]; }
        }
        return water;
    }
};`,
    },
  },
  {
    slug: "edit-distance",
    title: "Edit Distance",
    difficulty: "hard",
    topic: "Dynamic programming",
    statement:
      "Given two strings `word1` and `word2`, return the minimum number of single-character insertions, deletions or replacements needed to turn `word1` into `word2`.",
    constraints: ["0 ≤ word1.length, word2.length ≤ 500", "lowercase English letters"],
    examples: [
      { input: 'word1 = "horse", word2 = "ros"', output: "3", explanation: "horse → rorse → rose → ros." },
      { input: 'word1 = "intention", word2 = "execution"', output: "5", explanation: "" },
    ],
    signature: {
      functionName: "minDistance",
      params: [
        { name: "word1", type: "string" },
        { name: "word2", type: "string" },
      ],
      returnType: "int",
    },
    tests: [
      { args: '["horse","ros"]', expected: "3" },
      { args: '["intention","execution"]', expected: "5" },
      { args: '["",""]', expected: "0" },
      { args: '["abc",""]', expected: "3" },
      { args: '["","ab"]', expected: "2" },
      { args: '["kitten","sitting"]', expected: "3" },
    ],
    hints: [
      "Define dp[i][j] = edits to turn the first i letters of word1 into the first j letters of word2.",
      "If word1[i−1] == word2[j−1], dp[i][j] = dp[i−1][j−1]. Otherwise 1 + the min of three neighbours.",
      "Base cases: dp[i][0] = i, dp[0][j] = j. You only ever need the previous row — O(n) space.",
    ],
    approach:
      "Levenshtein DP. Each cell is either a free match from the diagonal or one plus the best of insert (left), delete (up) or replace (diagonal). A rolling row brings space to O(min(m, n)).",
    optimalTime: "O(m·n)",
    optimalSpace: "O(min(m, n))",
    solutions: {
      javascript: `function minDistance(word1, word2) {
  const m = word1.length, n = word2.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = word1[i - 1] === word2[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[n];
}`,
      python: `def min_distance(word1: str, word2: str) -> int:
    m, n = len(word1), len(word2)
    prev = list(range(n + 1))
    for i in range(1, m + 1):
        cur = [i] + [0] * n
        for j in range(1, n + 1):
            if word1[i - 1] == word2[j - 1]:
                cur[j] = prev[j - 1]
            else:
                cur[j] = 1 + min(prev[j - 1], prev[j], cur[j - 1])
        prev = cur
    return prev[n]`,
      java: `class Solution {
    public int minDistance(String word1, String word2) {
        int m = word1.length(), n = word2.length();
        int[] prev = new int[n + 1];
        for (int j = 0; j <= n; j++) prev[j] = j;
        for (int i = 1; i <= m; i++) {
            int[] cur = new int[n + 1];
            cur[0] = i;
            for (int j = 1; j <= n; j++)
                cur[j] = word1.charAt(i - 1) == word2.charAt(j - 1)
                    ? prev[j - 1]
                    : 1 + Math.min(prev[j - 1], Math.min(prev[j], cur[j - 1]));
            prev = cur;
        }
        return prev[n];
    }
}`,
      cpp: `class Solution {
public:
    int minDistance(string& word1, string& word2) {
        int m = word1.size(), n = word2.size();
        vector<int> prev(n + 1);
        iota(prev.begin(), prev.end(), 0);
        for (int i = 1; i <= m; i++) {
            vector<int> cur(n + 1);
            cur[0] = i;
            for (int j = 1; j <= n; j++)
                cur[j] = word1[i - 1] == word2[j - 1]
                    ? prev[j - 1]
                    : 1 + min({prev[j - 1], prev[j], cur[j - 1]});
            prev = cur;
        }
        return prev[n];
    }
};`,
    },
  },
  {
    slug: "largest-rectangle",
    title: "Largest Rectangle in Histogram",
    difficulty: "hard",
    topic: "Monotonic stack",
    statement:
      "`heights[i]` is the height of a histogram bar of width 1. Return the area of the largest rectangle that fits entirely inside the histogram.",
    constraints: ["1 ≤ heights.length ≤ 10⁵", "0 ≤ heights[i] ≤ 10⁴"],
    examples: [
      { input: "heights = [2,1,5,6,2,3]", output: "10", explanation: "Bars 5 and 6 give 5 × 2." },
      { input: "heights = [2,4]", output: "4", explanation: "" },
    ],
    signature: {
      functionName: "largestRectangleArea",
      params: [{ name: "heights", type: "int[]" }],
      returnType: "int",
    },
    tests: [
      { args: "[[2,1,5,6,2,3]]", expected: "10" },
      { args: "[[2,4]]", expected: "4" },
      { args: "[[1]]", expected: "1" },
      { args: "[[2,2,2,2]]", expected: "8" },
      { args: "[[6,2,5,4,5,1,6]]", expected: "12" },
      { args: "[[0,0]]", expected: "0" },
    ],
    hints: [
      "For each bar, the best rectangle using its full height stretches until a shorter bar on each side.",
      "Finding 'next shorter bar' for every bar is a classic monotonic stack job.",
      "Keep a stack of indices with increasing heights. When a shorter bar arrives, pop and compute the popped bar's area; add a 0-height sentinel at the end to flush.",
    ],
    approach:
      "Monotonic increasing stack of indices. When the current bar is shorter than the top, pop it: its rectangle's width runs from the new top + 1 to the current index − 1. A final zero-height sentinel empties the stack.",
    optimalTime: "O(n)",
    optimalSpace: "O(n)",
    solutions: {
      javascript: `function largestRectangleArea(heights) {
  const stack = [];
  let best = 0;
  for (let i = 0; i <= heights.length; i++) {
    const h = i === heights.length ? 0 : heights[i];
    while (stack.length && heights[stack[stack.length - 1]] > h) {
      const top = stack.pop();
      const left = stack.length ? stack[stack.length - 1] + 1 : 0;
      best = Math.max(best, heights[top] * (i - left));
    }
    stack.push(i);
  }
  return best;
}`,
      python: `def largest_rectangle_area(heights: list[int]) -> int:
    stack, best = [], 0
    for i in range(len(heights) + 1):
        h = 0 if i == len(heights) else heights[i]
        while stack and heights[stack[-1]] > h:
            top = stack.pop()
            left = stack[-1] + 1 if stack else 0
            best = max(best, heights[top] * (i - left))
        stack.append(i)
    return best`,
      java: `class Solution {
    public int largestRectangleArea(int[] heights) {
        Deque<Integer> stack = new ArrayDeque<>();
        int best = 0, n = heights.length;
        for (int i = 0; i <= n; i++) {
            int h = i == n ? 0 : heights[i];
            while (!stack.isEmpty() && heights[stack.peek()] > h) {
                int top = stack.pop();
                int left = stack.isEmpty() ? 0 : stack.peek() + 1;
                best = Math.max(best, heights[top] * (i - left));
            }
            stack.push(i);
        }
        return best;
    }
}`,
      cpp: `class Solution {
public:
    int largestRectangleArea(vector<int>& heights) {
        vector<int> st;
        int best = 0, n = heights.size();
        for (int i = 0; i <= n; i++) {
            int h = i == n ? 0 : heights[i];
            while (!st.empty() && heights[st.back()] > h) {
                int top = st.back(); st.pop_back();
                int left = st.empty() ? 0 : st.back() + 1;
                best = max(best, heights[top] * (i - left));
            }
            st.push_back(i);
        }
        return best;
    }
};`,
    },
  },
  {
    slug: "median-two-sorted",
    title: "Median of Two Sorted Arrays",
    difficulty: "hard",
    topic: "Binary search",
    statement:
      "Given two sorted arrays `nums1` and `nums2`, return the median of all their elements combined. Aim for O(log(min(m, n))).",
    constraints: ["0 ≤ m, n ≤ 1000", "1 ≤ m + n", "-10⁶ ≤ values ≤ 10⁶"],
    examples: [
      { input: "nums1 = [1,3], nums2 = [2]", output: "2.0", explanation: "Merged: [1,2,3]." },
      { input: "nums1 = [1,2], nums2 = [3,4]", output: "2.5", explanation: "(2 + 3) / 2." },
    ],
    signature: {
      functionName: "findMedianSortedArrays",
      params: [
        { name: "nums1", type: "int[]" },
        { name: "nums2", type: "int[]" },
      ],
      returnType: "float",
    },
    tests: [
      { args: "[[1,3],[2]]", expected: "2" },
      { args: "[[1,2],[3,4]]", expected: "2.5" },
      { args: "[[],[1]]", expected: "1" },
      { args: "[[2],[]]", expected: "2" },
      { args: "[[1,2,3,4,5],[6,7,8]]", expected: "4.5" },
      { args: "[[0,0],[0,0]]", expected: "0" },
    ],
    hints: [
      "Merging is O(m + n). The log-time solution never merges — it partitions.",
      "Cut both arrays so the left halves together hold half the elements and every left value ≤ every right value.",
      "Binary-search the cut in the shorter array; the other cut follows. Compare maxLeft/minRight across arrays to move it.",
    ],
    approach:
      "Binary search a partition i in the shorter array, with j = half − i in the other, until max(left parts) ≤ min(right parts). The median comes from those four border values.",
    optimalTime: "O(log(min(m, n)))",
    optimalSpace: "O(1)",
    solutions: {
      javascript: `function findMedianSortedArrays(nums1, nums2) {
  if (nums1.length > nums2.length) [nums1, nums2] = [nums2, nums1];
  const m = nums1.length, n = nums2.length, half = (m + n + 1) >> 1;
  let lo = 0, hi = m;
  while (lo <= hi) {
    const i = (lo + hi) >> 1, j = half - i;
    const aL = i ? nums1[i - 1] : -Infinity, aR = i < m ? nums1[i] : Infinity;
    const bL = j ? nums2[j - 1] : -Infinity, bR = j < n ? nums2[j] : Infinity;
    if (aL <= bR && bL <= aR) {
      const left = Math.max(aL, bL);
      return (m + n) % 2 ? left : (left + Math.min(aR, bR)) / 2;
    }
    if (aL > bR) hi = i - 1; else lo = i + 1;
  }
  return 0;
}`,
      python: `def find_median_sorted_arrays(nums1: list[int], nums2: list[int]) -> float:
    a, b = (nums1, nums2) if len(nums1) <= len(nums2) else (nums2, nums1)
    m, n = len(a), len(b)
    half = (m + n + 1) // 2
    lo, hi = 0, m
    inf = float("inf")
    while lo <= hi:
        i = (lo + hi) // 2
        j = half - i
        a_l = a[i - 1] if i else -inf
        a_r = a[i] if i < m else inf
        b_l = b[j - 1] if j else -inf
        b_r = b[j] if j < n else inf
        if a_l <= b_r and b_l <= a_r:
            left = max(a_l, b_l)
            return float(left) if (m + n) % 2 else (left + min(a_r, b_r)) / 2
        if a_l > b_r:
            hi = i - 1
        else:
            lo = i + 1
    return 0.0`,
      java: `class Solution {
    public double findMedianSortedArrays(int[] nums1, int[] nums2) {
        if (nums1.length > nums2.length) return findMedianSortedArrays(nums2, nums1);
        int m = nums1.length, n = nums2.length, half = (m + n + 1) / 2, lo = 0, hi = m;
        while (lo <= hi) {
            int i = (lo + hi) / 2, j = half - i;
            double aL = i > 0 ? nums1[i - 1] : Double.NEGATIVE_INFINITY;
            double aR = i < m ? nums1[i] : Double.POSITIVE_INFINITY;
            double bL = j > 0 ? nums2[j - 1] : Double.NEGATIVE_INFINITY;
            double bR = j < n ? nums2[j] : Double.POSITIVE_INFINITY;
            if (aL <= bR && bL <= aR) {
                double left = Math.max(aL, bL);
                return (m + n) % 2 == 1 ? left : (left + Math.min(aR, bR)) / 2;
            }
            if (aL > bR) hi = i - 1; else lo = i + 1;
        }
        return 0;
    }
}`,
      cpp: `class Solution {
public:
    double findMedianSortedArrays(vector<int>& nums1, vector<int>& nums2) {
        if (nums1.size() > nums2.size()) return findMedianSortedArrays(nums2, nums1);
        int m = nums1.size(), n = nums2.size(), half = (m + n + 1) / 2, lo = 0, hi = m;
        while (lo <= hi) {
            int i = (lo + hi) / 2, j = half - i;
            double aL = i > 0 ? nums1[i - 1] : -1e18, aR = i < m ? nums1[i] : 1e18;
            double bL = j > 0 ? nums2[j - 1] : -1e18, bR = j < n ? nums2[j] : 1e18;
            if (aL <= bR && bL <= aR) {
                double left = max(aL, bL);
                return (m + n) % 2 ? left : (left + min(aR, bR)) / 2;
            }
            if (aL > bR) hi = i - 1; else lo = i + 1;
        }
        return 0;
    }
};`,
    },
  },
];

export function bankProblem(slug: string): BankProblem | null {
  return BANK.find((p) => p.slug === slug) ?? null;
}
