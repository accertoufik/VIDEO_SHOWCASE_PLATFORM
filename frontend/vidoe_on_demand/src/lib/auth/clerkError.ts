//clerk errors carry a list of { longMessage, message }. Duck-typed so it works across versions of clerk. See https://clerk.com/docs/references/typescript/errors

export const clerkErrorMessage = (error: unknown): string => { 
    const errors = (
      error as {
        errors?: Array<{ longMessage?: string; message?: string }>;
      } | null
    )?.errors;

    const first = errors?.[0];
    if (first?.longMessage) return first.longMessage;
    if (first?.message) return first.message;
    if(error instanceof Error && error.message) return error.message;
    return "Something went wrong. Please try again later.";
}