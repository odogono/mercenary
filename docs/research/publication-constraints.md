# Publication constraints for reconstructed game data

Research date: 11 August 2026

Wayfinder ticket: [Research publication constraints for reconstructed game data](https://github.com/odogono/mercenary/issues/4)

## Scope and caution

This is an engineering research note, not legal advice. It identifies primary legal and official sources, areas of uncertainty, and questions that should be put to qualified intellectual-property counsel before any public release.

The analysis assumes that development occurs in the United Kingdom, that the eventual macOS application and source repository may be available internationally, and that the supplied C64 ROM image is used as research evidence. This investigation did **not** establish the provenance of that image, the identity or current ownership of any relevant rights, whether the image contains an effective technological protection measure, or which territories will be served. Each is a release-blocking fact to establish.

## Executive finding

An independently written native implementation is necessary, but it is not by itself a publication clearance. Copyright distinguishes program functionality, ideas, principles, systems, and methods from protected expression: the EU Software Directive excludes ideas and principles underlying a program, the CJEU held in *SAS Institute* that program functionality, programming language, and data-file formats are not themselves protected forms of program expression, and US law excludes ideas, processes, systems, and methods of operation from copyright protection. ([Directive 2009/24/EC, arts. 1–2](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32009L0024); [*SAS Institute Inc. v World Programming Ltd*, C-406/10](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62010CJ0406); [17 U.S.C. § 102](https://www.copyright.gov/title17/92chap1.html#102))

That boundary does not make a faithful game clone categorically safe. A video game can contain separately protected program code, text, music, sound recordings, images, and an audiovisual presentation. The CJEU has treated a video game as more than software where its images and sounds possess their own creative value, while UK law separately protects literary works (including computer programs), musical and artistic works, sound recordings, and films. ([*Nintendo Co. Ltd v PC Box Srl*, C-355/12, paras. 16, 21–23](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:62012CJ0355); [Copyright, Designs and Patents Act 1988 (CDPA), §§ 1, 3–5A](https://www.legislation.gov.uk/ukpga/1988/48/part/I/chapter/I)) Exact text, audio, object designs, scene composition, world layout, and other authored selections therefore require content-by-content legal analysis even when no original machine code is shipped. This last sentence is a risk inference from the cited categories and exclusive rights, not a conclusion that any particular Mercenary datum is protected.

The current evidence supports a conservative workflow: keep all ROMs, disassembly, memory dumps, exact decoded tables, and bypass material private; publish independently written tools and synthetic fixtures only; classify every derived artifact; and make public or ship exact reconstructed content only after counsel has assessed it or the relevant rightsholder has licensed it. A clean-room separation and detailed provenance record are useful evidence of independent authorship, but no source reviewed creates a statutory “clean-room safe harbour.”

## What the primary sources establish

### 1. Copyright reaches more than source code

In the UK, a computer program is a literary work. Copyright owners control copying, public distribution, public performance/showing/playing, communication to the public, and adaptation of the whole work or any substantial part; copying includes electronic storage, and converting a program into another language or code is an adaptation. ([CDPA § 3](https://www.legislation.gov.uk/ukpga/1988/48/section/3); [CDPA §§ 16–21](https://www.legislation.gov.uk/ukpga/1988/48/part/I/chapter/II/crossheading/the-acts-restricted-by-copyright)) Official IPO guidance likewise warns that buying a physical copy does not acquire copyright and that permission, ownership, or a specific exception is needed to use protected material. ([IPO, “Using somebody else's intellectual property: Copyright”](https://www.gov.uk/using-somebody-elses-intellectual-property/copyright))

In the United States, copyright applies to original literary, musical, pictorial, audiovisual, and sound-recording expression, and the owner controls reproduction, derivative works, distribution, public performance, and public display, subject to statutory limitations. ([17 U.S.C. §§ 102, 106](https://www.copyright.gov/title17/92chap1.html#102)) The US Copyright Office says program protection covers copyrightable expression but not algorithms, formatting, functions, logic, or system design; its registration guidance treats video games, screen displays, manuals, object code, and program deposits as potentially distinct material. ([Copyright Office, Circular 61](https://www.copyright.gov/circs/circ61.pdf))

Accordingly, the project should maintain separate rights records for at least:

- original C64 object code and any translated or copied instruction sequences;
- in-game prose, messages, names, manuals, and narrative material;
- object drawings/models, map and scene composition, interface artwork, and screen presentation;
- musical composition, performance, and sound recording/fixed sound data;
- the selection or arrangement of tables and any dataset claimed as a database; and
- the title, publisher/developer names, logos, and other brand identifiers.

This list is a clearance inventory, not a finding that every item has a separate surviving right or owner.

### 2. Functional facts and exact expression need to be separated

Article 1(2) of the EU Software Directive protects the expression of a computer program but not the ideas and principles underlying any element, including interfaces. Article 5(3) permits a person entitled to use a copy to observe, study, or test its functioning, while performing authorised loading, display, running, transmission, or storage, to determine those ideas and principles. ([Directive 2009/24/EC, arts. 1(2), 5(3)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32009L0024)) In *SAS Institute*, the CJEU held that functionality, programming language, and data-file formats were not forms of program expression, but also held that reproducing elements of a user manual could infringe if those elements expressed the author's intellectual creation. ([*SAS Institute*, C-406/10, paras. 39–46, 65–71](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62010CJ0406))

The parallel US rule excludes ideas, procedures, processes, systems, methods of operation, concepts, principles, and discoveries regardless of how they are embodied. ([17 U.S.C. § 102(b)](https://www.copyright.gov/title17/92chap1.html#102)) It does not follow that every datum produced by observing a game is unprotected: an exact authored set of vertices, edge connections, placements, names, and scene relationships may embody creative selection or arrangement, and a whole reconstructed world can resemble the original audiovisual work even where each coordinate appears factual in isolation. That is an inference requiring counsel and, ultimately, is fact- and jurisdiction-dependent.

For the World Geometry Dataset, provenance should therefore record both **origin** and **legal classification**. “ROM offset and decode rule” proves where a value came from; it does not prove that publishing the value is permitted.

### 3. Reverse engineering exceptions are narrow and purpose-dependent

UK law permits a lawful user to observe, study, or test a program to determine underlying ideas and principles while performing acts the user is entitled to perform. ([CDPA § 50BA](https://www.legislation.gov.uk/ukpga/1988/48/section/50BA)) UK decompilation is narrower: it must be necessary to obtain information needed to create an independent program that can operate with the decompiled or another program; readily available information must be used first; work must be limited to what is necessary; information may be shared only as needed for that objective; and it may not be used to create substantially similar expression or to perform another restricted act. ([CDPA § 50B](https://www.legislation.gov.uk/ukpga/1988/48/section/50B)) A necessary backup copy may be made by a lawful user for lawful use, but that provision is not permission to distribute the backup. ([CDPA § 50A](https://www.legislation.gov.uk/ukpga/1988/48/section/50A))

Those sections make the legal status of the particular copy and research act central. Counsel should decide whether the researcher is a “lawful user,” whether static disassembly and emulator memory inspection fit the permitted acts, and whether a standalone remake has the interoperability objective required for decompilation. The project should not assume that “independent program” alone satisfies the interoperability condition.

US law similarly permits an owner of a copy to make an essential-step or archival copy only under § 117's conditions. Section 1201 separately prohibits circumvention of effective access controls; its reverse-engineering exception applies only to a person who lawfully obtained the right to use a program, only to identify and analyse previously unavailable elements necessary for interoperability, and only where the activity is otherwise non-infringing. Sharing the resulting information or means is likewise limited to enabling interoperability and compliance with other law. ([17 U.S.C. § 117](https://www.copyright.gov/title17/92chap1.html#117); [17 U.S.C. § 1201(a), (f)](https://www.copyright.gov/title17/92chap12.html#1201))

The current US triennial exemption does not provide a general preservation or remake licence. For games not reasonably available commercially, it is limited to preservation by eligible libraries, archives, and museums, without commercial advantage and without making the game available outside their physical premises. ([37 C.F.R. § 201.40(b)(19)](https://www.copyright.gov/title37/201/37cfr201-40.html)) UK official guidance likewise states that technological protection measures are legally protected and that circumvention can be unlawful. ([IPO, “Exceptions to copyright”](https://www.gov.uk/guidance/exceptions-to-copyright#technological-protection-measures)) Whether this particular C64 image or its original medium contains an “effective” measure and whether any tool circumvents it are unresolved factual and legal questions.

### 4. Research exceptions do not automatically clear publication

UK fair dealing for research is limited to non-commercial research, must be fair, and generally requires sufficient acknowledgement; separate criticism/review provisions have their own conditions. ([CDPA § 29](https://www.legislation.gov.uk/ukpga/1988/48/section/29); [CDPA § 30](https://www.legislation.gov.uk/ukpga/1988/48/section/30)) US fair use requires a case-specific assessment of purpose and character, nature of the work, amount and substantiality, and market effect. ([17 U.S.C. § 107](https://www.copyright.gov/title17/92chap1.html#107)) Neither rule turns all research output into freely distributable content.

Therefore, internal use of a screenshot, ROM excerpt, decoded table, or reference audio for analysis and a public repository containing the same material are distinct clearance events. Public issue comments, CI logs, release bundles, Git history, package registries, and comparison images should all be treated as publication surfaces.

### 5. Dataset rights are a separate uncertainty

UK and EU regimes distinguish copyright in an original selection or arrangement from a sui generis right protecting qualifying database contents after substantial investment in obtaining, verifying, or presenting them. The database right can restrict extraction or re-utilisation of all or a substantial part, and repeated systematic extraction of insubstantial parts can also be restricted. ([IPO, “Sui generis database rights”](https://www.gov.uk/guidance/sui-generis-database-rights); [Directive 96/9/EC, arts. 3, 7–9](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:31996L0009)) The CJEU has held that investment in creating the underlying data is not the same as investment in obtaining existing independent materials, which may matter when deciding whether an embedded game-world table qualifies. ([*British Horseracing Board Ltd v William Hill Organization Ltd*, C-203/02, paras. 30–42](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62002CJ0203))

It is unresolved whether any structure inside the C64 program is legally a database, whether a qualifying database right ever arose, whether it survives, and whether the World Geometry Dataset would reproduce a protected selection/arrangement or extract protected contents. Counsel should address this separately from program copyright.

### 6. Age, obscurity, and an unavailable owner do not establish permission

UK copyright usually lasts for the author's life plus 70 years for written, dramatic, musical, and artistic works, with different rules for sound recordings, films, unknown authorship, and other categories. ([IPO, “How long copyright lasts”](https://www.gov.uk/copyright/how-long-copyright-lasts)) US duration for post-1977 works also depends on authorship and work-for-hire status and can extend to life plus 70 years or, for work made for hire, 95 years from publication or 120 years from creation, whichever is shorter. ([Copyright Office, Circular 15A](https://www.copyright.gov/circs/circ15a.pdf)) The 1985 publication date alone is therefore not a basis for treating Mercenary as public domain.

If a diligent search cannot locate a rightsholder, the UK orphan-works scheme may license a specified use after review and payment, but an IPO licence is valid only in the UK, is time-limited, and does not clear other rightsholders or territories. ([IPO, orphan-works scheme overview, “Territoriality”](https://www.gov.uk/government/publications/orphan-works-overview-for-applicants/orphan-works-licensing-scheme-overview-for-applicants#the-orphan-works-licence); [IPO diligent-search guidance](https://www.gov.uk/government/publications/orphan-works-diligent-search-guidance-for-applicants)) A worldwide download therefore needs a territory strategy beyond a UK orphan licence.

### 7. Names and marketing require their own clearance

Trade marks protect source-identifying brands, including product or service names. The UK IPO and US Patent and Trademark Office both provide official search systems and advise searching for identical and confusingly similar marks in related goods or services. ([UK IPO trade-mark search](https://www.gov.uk/search-for-trademark); [USPTO trademark search](https://www.uspto.gov/trademarks/search); [USPTO likelihood-of-confusion guidance](https://www.uspto.gov/trademarks/search/likelihood-confusion))

No trade-mark clearance was performed here. Before naming or marketing the application, counsel should search current registrations and common-law/unregistered uses for “Mercenary,” “Escape from Targ,” “Novagen,” relevant logos, and confusingly similar variants, then distinguish any permitted descriptive historical reference from use as the new product's brand.

## Recommended publication-control policy

The following is an engineering risk-control proposal, not a legal classification.

| Class | Examples | Default before counsel review |
| --- | --- | --- |
| Restricted source evidence | ROMs, disk/tape images, memory snapshots, disassemblies, decompiler output, loader/protection bypass details, exact original binaries | Encrypted/local access only; never commit, attach to issues, publish in logs, or bundle |
| Restricted derived expression | Exact decoded geometry/world tables, original text, audio data or faithful transcriptions, object names, screenshots/video, manual scans, comparison captures | Keep private; review item by item before publication or shipping |
| Reviewable analytical output | Offset/hash manifests, record counts, schemas, field meanings, behaviour traces, pseudocode, small excerpts, transformation notes | Publish only after checking that the item reveals no protected expression, bypass material, confidential data, or impermissible excerpt |
| Independently authored material | New Swift/Metal code, original extractor code, generic file parsers, synthetic fixtures, original documentation and tests | Candidate for normal open-source publication after ordinary licence/security review |

Practical controls:

1. Keep `roms/` ignored and outside all public history. Store a cryptographic hash, acquisition record, physical-media evidence, who had access, and the legal basis asserted for each copy.
2. Give every research artifact an identifier, producer/tool version, input hash, source offsets or runtime observation reference, date, and an `internal`, `review`, or `cleared` publication status.
3. Keep raw decoding and interpretation in a restricted research area. Feed implementers a functional specification stripped of machine code and unapproved expressive payloads. Record who saw which materials.
4. Build public tests with synthetic fixtures. Run ROM-dependent extraction and visual comparisons only in a private environment whose logs and artifacts cannot become public by default.
5. Make the application content manifest distinguish newly authored content, licensed content, and reconstructed content; attach the rightsholder, territory, term, permitted uses, attribution, and evidence for each clearance.
6. Add an automated release check that fails if known ROM hashes, binary fragments, restricted paths, or uncleared content identifiers appear in Git history or release artifacts.
7. Require counsel's written release decision for the geometry dataset, every exact audiovisual/textual asset family, the chosen title/branding, the extraction tool if it includes bypass logic, and the target territory list.

## Questions for qualified counsel

### Rights and ownership

1. Which legal persons currently own the C64 program, audiovisual, literary, musical, sound-recording, manual, and trade-mark rights, accounting for Novagen's corporate history, employment agreements, assignments, insolvency/dissolution, and any publisher/platform licences?
2. What are the applicable authorship and expiry rules for each work in the UK, EU target states, United States, and every intended distribution territory? Is any component public domain in one territory but not another?
3. If an owner cannot be found, could the UK orphan-works scheme cover any proposed use, and how should the product be geofenced or otherwise restricted given that such a licence is UK-only?

### Lawful access and reverse engineering

4. Does the documented source of each ROM image make the researcher a “lawful user” under CDPA §§ 50A–50BA and a person who lawfully obtained the right to use a copy under 17 U.S.C. §§ 117 and 1201(f)? What evidence must be retained?
5. Which proposed acts—imaging original media, emulator execution, patching, memory snapshots, tracing, static disassembly, decompilation, and decoding tables—are permitted in each relevant jurisdiction and under which exception?
6. Is a standalone native remake “interoperability” for CDPA § 50B, Directive 2009/24/EC art. 6, or 17 U.S.C. § 1201(f), or must research rely on observation/testing and other doctrines instead?
7. Does the C64 release contain an effective technological protection measure? If so, which actions or public tools would constitute circumvention, provision of circumvention means, or trafficking?
8. Does any licence or contractual restriction attach to the particular copy, and which statutory permissions cannot be contracted away in the relevant territory?

### Reconstructed content

9. For each geometry field—vertices, edges, model topology, object identity, placement, orientation, scale, collision bounds, visibility/detail rules, surface/underground/orbital layout—which elements are unprotected facts, systems, methods, or scènes à faire, and which may be protected expression or a substantial part?
10. Would distributing the full World Geometry Dataset reproduce a protected selection/arrangement, extract or re-utilise a protected database, create an adaptation, or expose a substantial part even if individual numbers are unprotected?
11. How much independent variation is required for object models, world layout, UI, text, timing, audio, and scene presentation while still meeting the desired gameplay fidelity? Which “Preserved Quirks” are functional behaviour and which reproduce expression?
12. May the release use exact original text, names, sound data, musical composition, screen layout, object silhouettes, and colour/presentation choices? If not, what must be licensed, replaced, or redesigned?
13. Are small ROM excerpts, screenshots, audio clips, and comparison renders in research notes or verification reports fair dealing/fair use, and what limits, acknowledgements, access controls, and purposes are required?

### Publication and branding

14. May independently authored extraction tools be published if they expose offsets, decode rules, or bypass logic, and may they accept user-supplied ROMs without distributing any ROM content?
15. Is publishing hashes, provenance manifests, behaviour traces, pseudocode, and decoded record counts low enough risk, and what redactions are required?
16. Can “Mercenary,” “Escape from Targ,” “Novagen,” or original logos be used as the product name, repository name, metadata, screenshots, or historical description in each target territory? What disclaimer avoids implying sponsorship without undermining any nominative/descriptive-use position?
17. What distribution territories, storefronts, source hosts, CI providers, and CDN locations create relevant acts of publication or communication, and should availability be territorially limited?
18. What written licences, contributor representations, notices, attributions, indemnities, insurance, and takedown process are required before the repository, dataset, application, marketing site, or binaries become public?

## Release gate

The evidence supports the project's existing decision to require qualified human legal review. Until that review is complete, the reproducible extraction pipeline and validated geometry may be developed as restricted research artifacts, but the ROM, original binary material, exact decoded payloads, reconstructed geometry dataset, original text/audio/artwork, and faithful comparison media should not be made public or included in a distributed build.

The implementation specification should record legal clearance as a per-artifact property, not as a single project-wide yes/no. That preserves the ability to publish independently authored engine and tooling work even if exact content later requires licensing or replacement.
