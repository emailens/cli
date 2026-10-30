import { Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text } from "@react-email/components";

export default function Welcome({ name = "there" }: { name?: string }) {
  return (
    <Html lang="en">
      <Head>
        <title>Welcome to Acme</title>
      </Head>
      <Preview>Your Acme account is ready. Here is how to get started.</Preview>
      <Body style={{ backgroundColor: "#f4f4f5", margin: 0, fontFamily: "Arial, Helvetica, sans-serif" }}>
        <Container style={{ maxWidth: "600px", backgroundColor: "#ffffff", padding: "32px" }}>
          <Heading as="h1" style={{ fontSize: "24px", lineHeight: "32px", color: "#111111", margin: "0 0 16px" }}>
            Welcome, {name}
          </Heading>
          <Text style={{ fontSize: "16px", lineHeight: "24px", color: "#333333" }}>
            Your account is ready. Start by creating your first project; it takes about a minute.
          </Text>
          <Section style={{ padding: "8px 0 24px" }}>
            <Button
             href="https://example.com/projects/new"
              style={{ backgroundColor: "#1d4ed8", color: "#ffffff", fontSize: "16px", padding: "12px 20px", borderRadius: "6px" }}
            >
              Create a project
            </Button>
          </Section>
          <Text style={{ fontSize: "12px", lineHeight: "18px", color: "#555555" }}>
            Acme Inc, 1 Main Street, Springfield. You are receiving this because you signed up at example.com.{" "}
            <Link href="https://example.com/unsubscribe" style={{ color: "#1d4ed8" }}>
              Unsubscribe
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
