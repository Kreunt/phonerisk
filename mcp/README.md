# phonerisk-mcp

An [MCP](https://modelcontextprotocol.io) server that lets an AI assistant validate phone numbers and judge how risky they look. It gives Claude, Cursor, VS Code and other MCP clients three tools backed by the [PhoneRisk API](https://rapidapi.com/daimaileri20/api/phonerisk-api).

Ask your assistant things like:

- "Is +44 901 234 5678 safe to accept as a customer's phone number?"
- "Clean up this list of phone numbers and tell me which ones are landlines."
- "Pull every phone number out of this email thread and normalise them."

## Tools

| Tool | What it does |
| --- | --- |
| `lookup_phone_number` | Validates one number and returns its formats, country, line type, carrier, time zone and local time, whether it is a known disposable number, and a 0-100 risk score with reasons and an allow / review / block recommendation |
| `lookup_phone_numbers` | The same for a list of up to 100 numbers |
| `extract_phone_numbers` | Finds every phone number in a text of up to 20,000 characters and looks each one up |

All three tools only read data. Each takes an optional `default_region`, a two-letter country code used to read numbers written without a leading `+`.

## Setup

You need Node.js 18 or newer and a RapidAPI key. Subscribe to a plan on the [PhoneRisk API listing](https://rapidapi.com/daimaileri20/api/phonerisk-api) to get the key.

### Claude Desktop, Cursor and other clients with a JSON configuration

Add the server to the client's MCP configuration file:

```json
{
  "mcpServers": {
    "phonerisk": {
      "command": "npx",
      "args": ["-y", "phonerisk-mcp"],
      "env": {
        "RAPIDAPI_KEY": "YOUR_RAPIDAPI_KEY"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add --env RAPIDAPI_KEY=YOUR_RAPIDAPI_KEY phonerisk -- npx -y phonerisk-mcp
```

## Settings

| Variable | Meaning |
| --- | --- |
| `RAPIDAPI_KEY` | Your RapidAPI key. Required to look numbers up; without it the server starts and its tools explain how to get a key. |
| `PHONERISK_HOST` | The RapidAPI host. Defaults to `phonerisk-api.p.rapidapi.com`. |

## What the answers mean

- `valid` means the number fits its country's numbering plan. It does not confirm that the number is in service.
- Most facts come as `{value, confidence, source}`, with confidence from 0 to 1.
- `risk.recommendation` is `allow` for a score of 0 to 29, `review` for 30 to 69 and `block` for 70 to 100. `risk.reasons` lists every weight that was added.
- Answers come from numbering-plan data and public lists of disposable numbers. Nothing is sent to the phone network, so the tools cannot say whether a number is switched on, who owns it or which carrier it moved to.

Numbers you look up are sent to the PhoneRisk API through RapidAPI. The API processes them in memory and does not write them to logs.

## Links

- [Documentation](https://phonerisk.up.railway.app/docs)
- [Free phone risk checker](https://phonerisk.up.railway.app/)
- [Plans and API keys](https://rapidapi.com/daimaileri20/api/phonerisk-api)
- [Source, and the Python and JavaScript clients](https://github.com/Kreunt/phonerisk)

<!-- mcp-name: io.github.Kreunt/phonerisk -->
