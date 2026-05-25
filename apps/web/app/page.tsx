import { redirect } from "next/navigation";

/** Local / production entry: go straight to the app, not the Next.js marketing stub. */
export default function Home() {
  redirect("/login");
}
