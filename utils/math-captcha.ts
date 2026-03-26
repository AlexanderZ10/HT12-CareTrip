export type MathOperator = "+" | "-" | "×";

export type MathCaptcha = {
  answer: number;
  left: number;
  operator: MathOperator;
  prompt: string;
  right: number;
};

function getRandomDigit() {
  return Math.floor(Math.random() * 9) + 1;
}

export function createMathCaptcha(): MathCaptcha {
  const operators: MathOperator[] = ["+", "-", "×"];
  const operator = operators[Math.floor(Math.random() * operators.length)];

  let left = getRandomDigit();
  let right = getRandomDigit();

  if (operator === "-" && left < right) {
    [left, right] = [right, left];
  }

  let answer = left + right;

  if (operator === "-") {
    answer = left - right;
  }

  if (operator === "×") {
    answer = left * right;
  }

  return {
    answer,
    left,
    operator,
    prompt: `${left} ${operator} ${right} = ?`,
    right,
  };
}
