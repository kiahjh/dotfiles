import base64
import email
import email.policy
import importlib.machinery
import importlib.util
import unittest
from pathlib import Path

PATH = Path(__file__).resolve().parents[2] / "bin/.local/bin/gmail"
loader = importlib.machinery.SourceFileLoader("gmail_cli", str(PATH))
spec = importlib.util.spec_from_loader("gmail_cli", loader)
gmail = importlib.util.module_from_spec(spec)
loader.exec_module(gmail)


def part(mime, text, filename="", headers=None, attachment_id=None):
    body = {"data": base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")}
    if attachment_id:
        body = {"attachmentId": attachment_id, "size": 10}
    return {"mimeType": mime, "filename": filename, "headers": headers or [], "body": body}


class MessageParsingTests(unittest.TestCase):
    def test_prefers_plain_text_and_lists_attachments(self):
        payload = {
            "mimeType": "multipart/mixed",
            "parts": [
                {"mimeType": "multipart/alternative", "parts": [
                    part("text/plain", "Hi Kiah 👋"),
                    part("text/html", "<p>Hi <b>Kiah</b></p>"),
                ]},
                part("image/png", "", filename="screenshot.png", attachment_id="att1"),
            ],
        }
        self.assertEqual(gmail.message_body(payload), "Hi Kiah 👋")
        self.assertEqual(gmail.attachments_of(payload)[0]["filename"], "screenshot.png")

    def test_falls_back_to_html(self):
        payload = part("text/html", "<style>p{}</style><p>One&nbsp;two</p><ul><li>a</li><li>b</li></ul>")
        self.assertEqual(gmail.message_body(payload), "One two\n- a\n- b")

    def test_respects_charset(self):
        raw = "café".encode("latin-1")
        payload = {
            "mimeType": "text/plain",
            "headers": [{"name": "Content-Type", "value": 'text/plain; charset="iso-8859-1"'}],
            "body": {"data": base64.urlsafe_b64encode(raw).decode()},
        }
        self.assertEqual(gmail.message_body(payload), "café")

    def test_trims_quoted_history(self):
        text = "Thanks, that worked!\n\nOn Mon, Nov 3, 2026 at 9:14 AM Kiah <k@x.com>\nwrote:\n> old"
        self.assertEqual(gmail.trim_quoted(text), "Thanks, that worked!\n[quoted text trimmed]")
        outlook = "Sure.\nFrom: Sam\nSent: Monday\nOld text"
        self.assertEqual(gmail.trim_quoted(outlook), "Sure.\n[quoted text trimmed]")
        self.assertEqual(gmail.trim_quoted("On my phone, sorry.\nIt broke."), "On my phone, sorry.\nIt broke.")


class ReplyTests(unittest.TestCase):
    mine = {"me@gmail.com", "support@gertrude.app"}

    def test_reply_threads_and_prefixes_subject(self):
        head = {
            "from": "Sam Milton <sam@example.com>", "to": "support@gertrude.app",
            "subject": "Blocked site", "message-id": "<b@x>", "references": "<a@x>",
        }
        result = gmail.reply_headers(head, self.mine, reply_all=False)
        self.assertEqual(result["To"], "Sam Milton <sam@example.com>")
        self.assertEqual(result["Subject"], "Re: Blocked site")
        self.assertEqual(result["In-Reply-To"], "<b@x>")
        self.assertEqual(result["References"], "<a@x> <b@x>")
        self.assertNotIn("Cc", result)

    def test_reply_all_skips_my_addresses_and_uses_reply_to(self):
        head = {
            "from": "Form <noreply@site.com>", "reply-to": "parent@example.com",
            "to": "support@gertrude.app, other@example.com", "cc": "me@gmail.com",
            "subject": "RE: Help",
        }
        result = gmail.reply_headers(head, self.mine, reply_all=True)
        self.assertEqual(result["To"], "parent@example.com")
        self.assertEqual(result["Cc"], "other@example.com")
        self.assertEqual(result["Subject"], "RE: Help")

    def test_follow_up_on_my_own_message_goes_to_original_recipient(self):
        head = {"from": "Kiah <me@gmail.com>", "to": "sam@example.com", "subject": "Re: Hi"}
        self.assertEqual(gmail.reply_headers(head, self.mine, False)["To"], "sam@example.com")

    def test_picks_the_address_the_mail_was_sent_to(self):
        send_as = [
            {"sendAsEmail": "me@gmail.com", "displayName": "Kiah", "isDefault": True},
            {"sendAsEmail": "support@gertrude.app", "displayName": "Gertrude"},
        ]
        self.assertEqual(gmail.pick_sender(send_as, ["support@gertrude.app"], None), "Gertrude <support@gertrude.app>")
        self.assertEqual(gmail.pick_sender(send_as, ["x@y.com"], None), "Kiah <me@gmail.com>")
        with self.assertRaises(gmail.CliError):
            gmail.pick_sender(send_as, [], "nope@x.com")

    def test_utf8_body_round_trips(self):
        message = gmail.build_message({"To": "a@b.com", "Subject": "Hi"}, "Hi Yael, this is Kiah from Gertrude 👋")
        decoded = email.message_from_bytes(
            base64.urlsafe_b64decode(gmail.encode_message(message)), policy=email.policy.default
        )
        self.assertEqual(decoded.get_content().strip(), "Hi Yael, this is Kiah from Gertrude 👋")


class FakeGmail:
    def __init__(self):
        self.calls = []

    def resolve_label(self, name):
        return gmail.resolve_label(
            [{"id": "INBOX", "name": "INBOX"}, {"id": "TRASH", "name": "TRASH"}, {"id": "Label_1", "name": "Gertrude Support"}],
            name,
        )

    def label_names(self):
        return {"INBOX": "INBOX", "Label_1": "Gertrude Support"}

    def call(self, method, path, params=None, body=None):
        self.calls.append((method, path, body))
        return {}


class LabelTests(unittest.TestCase):
    def test_resolves_names_case_insensitively(self):
        fake = FakeGmail()
        gmail.modify(fake, ["m1", "m2"], False, ["gertrude support"], ["INBOX"])
        self.assertEqual(fake.calls, [("POST", "messages/batchModify", {
            "ids": ["m1", "m2"], "addLabelIds": ["Label_1"], "removeLabelIds": ["INBOX"],
        })])

    def test_thread_mode_modifies_each_thread(self):
        fake = FakeGmail()
        gmail.modify(fake, ["t1"], True, [], ["INBOX"])
        self.assertEqual(fake.calls[0][1], "threads/t1/modify")

    def test_refuses_trash_and_unknown_labels(self):
        with self.assertRaises(gmail.CliError):
            gmail.modify(FakeGmail(), ["m1"], False, ["TRASH"], [])
        with self.assertRaises(gmail.CliError):
            gmail.modify(FakeGmail(), ["m1"], False, ["Nope"], [])

    def test_cli_has_no_send_delete_or_trash_commands(self):
        parser = gmail.build_parser()
        commands = parser._subparsers._group_actions[0].choices
        for forbidden in ("send", "delete", "trash", "spam"):
            self.assertNotIn(forbidden, commands)
        self.assertEqual(set(commands["draft"]._subparsers._group_actions[0].choices), {"new", "reply", "update", "show"})


if __name__ == "__main__":
    unittest.main()
