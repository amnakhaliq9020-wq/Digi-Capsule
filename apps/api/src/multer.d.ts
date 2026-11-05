declare module 'multer' {
  type Callback = (error: Error | null, value: string) => void;
  export function diskStorage(options: {
    destination: (req: unknown, file: unknown, callback: Callback) => void;
    filename: (req: unknown, file: unknown, callback: Callback) => void;
  }): unknown;
}
