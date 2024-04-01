import path from "path";

export default async (req, res, next) => {
  try {
    const __dirname = import.meta.dirname;
    const filePath = path.join(__dirname, decodeURIComponent(req.path));
    req.filePath = filePath;
    req.file = path.parse(path.basename(filePath));
    next();
  } catch (error) {
    next(error);
  }
}