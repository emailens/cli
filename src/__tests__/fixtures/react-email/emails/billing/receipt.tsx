import { Body, Container, Head, Html, Section, Text } from "@react-email/components";

export default function Receipt() {
  return (
    <Html lang="en">
      <Head />
      <Body style={{ backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" }}>
        <Container>
          <Section style={{ display: "flex", gap: "16px" }}>
            <Text style={{ color: "#111111" }}>Total</Text>
            <Text style={{ color: "#111111" }}>$12.00</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
