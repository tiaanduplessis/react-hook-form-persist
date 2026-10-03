// Each activation owns its suspension flag. It is never shared between hooks,
// and an old clear callback cannot reset or suspend a newer activation.
export const createStorageActivation = (
  name: string | null,
  storage: Storage | undefined
) => {
  let suspended = false;

  return {
    name,
    storage,
    isActive: () => name !== null && !suspended,
    attempt<T>(operation: () => T, onStorageError?: (error: unknown) => void) {
      if (name === null || suspended) {
        return;
      }

      try {
        return { value: operation() };
      } catch (error) {
        if (!onStorageError) {
          throw error;
        }
        // Set this before reporting: the handler may rerender or call clear.
        suspended = true;
        onStorageError(error);
      }
    },
  };
};
