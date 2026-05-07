# Privacy Policy

Last updated: 2026-05-07

## Overview

ContextClip processes page content locally in the user's browser to extract Markdown from the current page or a user-picked block.

ContextClip does **not** operate any server for data collection, analytics, tracking, or remote storage.

## What data ContextClip handles

ContextClip may access the following data **only when the user explicitly triggers it**:

- The content of the current web page or the user-picked page fragment
- Basic page metadata such as page title, URL, author, and timestamps when available
- Media URLs needed to build Markdown or ZIP exports

## What ContextClip does not do

ContextClip does **not**:

- collect personal data to any developer-controlled server
- sell user data
- share user data with third parties
- use analytics, ads, trackers, or telemetry
- use remote code execution

## Local processing and storage

- Extraction happens locally on the user's device
- The latest extraction result may be stored temporarily in `chrome.storage.session` so it is not lost if the extension service worker sleeps
- Exported Markdown or ZIP files are saved only when the user chooses to download them

`chrome.storage.session` is used only for temporary extension state and is not sent to the developer.

## Permissions use

ContextClip uses Chrome extension permissions only for its single purpose: converting the current page or a picked block into clean Markdown.

- `activeTab`: access the active page after the user clicks the extension or triggers a command
- `scripting`: inject the content script on demand
- `downloads`: save Markdown or ZIP exports chosen by the user
- `storage`: temporarily keep the latest extraction result in session storage

## Data sharing

ContextClip does not transmit collected page content or metadata to the developer or to third parties.

## User control

The extension runs only when the user explicitly starts extraction or selection.

Users control whether to:

- copy extracted Markdown
- download Markdown
- download ZIP exports

## Policy scope

This policy applies to the ContextClip Chrome extension.

## Contact

Project repository:

https://github.com/WingEdge777/ContextClip
