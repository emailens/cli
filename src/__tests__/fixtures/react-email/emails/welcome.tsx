import { Body, Container, Head, Html, Text } from "@react-email/components";
import { Footer } from "./_components/footer";

interface Props {
  name: string;
}

// No default for `name`: rendering with no props throws, so only a render
// that applies PreviewProps gets past this line.
export default function Welcome({ name }: Props) {
  return (
    <Html lang="en">
      <Head />
      <Body style={{ backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" }}>
        <Container>
          <Text style={{ color: "#111111" }}>Welcome, {name.toUpperCase()}</Text>
          <Footer />
        </Container>
      </Body>
    </Html>
  );
}

Welcome.PreviewProps = { name: "Ada" } satisfies Props;
