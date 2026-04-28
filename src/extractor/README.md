Extractor pipeline:
1. html extract clones raw page or selection
2. html preprocess cleans DOM and normalizes urls/media
3. domain adapters reshape site-specific content
4. generic adapter falls back with Readability
5. html normalize converts DOM -> IR
6. markdown render converts IR -> Markdown
7. export build-result adds assets / zip / filenames
