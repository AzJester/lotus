// ============================================================================
// The business card the Contacts preview pane shows for the selected contact,
// after the Notes 6/7 contact business card: the company across the top,
// the photo frame beside the name and title, then the business address on
// the left and the phone numbers and e-mail address on the right. Category
// and comments follow below the card. Groups get a card with their members.
// ============================================================================

import { Icon } from "../../components/Icon";
import type { Contact, ContactGroup } from "../../data/types";
import { presenceOf } from "../../lib/presence";
import { addressLines, categoriesOf, colleagueOf, displayName, plural, viewName } from "./pab";
import { writeMemoTo } from "./pabActions";

/** A Sametime presence dot for an Acme colleague. */
export function Presence({ name }: { name: string }) {
  const p = presenceOf(name);
  const label = p === "online" ? "Available" : p === "away" ? "Away" : "Offline";
  return <span className={"pab-presence " + p} title={`Sametime: ${label}`} />;
}

/** An e-mail address that starts a memo when clicked. */
export function MailLink({ c }: { c: Contact }) {
  return (
    <a
      className="pab-mail"
      href={`mailto:${c.email.trim()}`}
      title={`Write a memo to ${displayName(c)}`}
      onClick={(e) => {
        e.preventDefault();
        writeMemoTo([c]);
      }}
    >
      {c.email.trim()}
    </a>
  );
}

export function BusinessCard({ c }: { c: Contact }) {
  const colleague = colleagueOf(c);
  const addr = addressLines(c);
  const cats = categoriesOf(c);
  const reach = !!(c.workPhone.trim() || c.cellPhone.trim() || c.email.trim());
  return (
    <div className="pab-preview-scroll">
      <div className="pab-card">
        <div className="pab-card-band">
          <span className="pab-card-org">{c.company.trim()}</span>
        </div>
        <div className="pab-card-main">
          <div className="pab-photo">
            <Icon name="person" scale={3} />
          </div>
          <div className="pab-card-id">
            <div className="pab-card-name">
              <span>{displayName(c)}</span>
              {colleague && <Presence name={colleague.name} />}
            </div>
            {c.title.trim() && <div className="pab-card-title">{c.title.trim()}</div>}
          </div>
        </div>
        {(addr.length > 0 || reach) && (
          <div className="pab-card-foot">
            <div className="pab-card-addr">
              {addr.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
            {reach && (
              <table className="pab-card-reach">
                <tbody>
                  {c.workPhone.trim() && (
                    <tr>
                      <th>Business</th>
                      <td>{c.workPhone.trim()}</td>
                    </tr>
                  )}
                  {c.cellPhone.trim() && (
                    <tr>
                      <th>Cell</th>
                      <td>{c.cellPhone.trim()}</td>
                    </tr>
                  )}
                  {c.email.trim() && (
                    <tr>
                      <th>E-mail</th>
                      <td>
                        <MailLink c={c} />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
      {(cats.length > 0 || c.comments.trim()) && (
        <table className="pab-card-extra">
          <tbody>
            {cats.length > 0 && (
              <tr>
                <th>Category:</th>
                <td>{cats.join(", ")}</td>
              </tr>
            )}
            {c.comments.trim() && (
              <tr>
                <th>Comments:</th>
                <td className="pab-comments">{c.comments.trim()}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function GroupCard({ g, members }: { g: ContactGroup; members: Contact[] }) {
  return (
    <div className="pab-preview-scroll">
      <div className="pab-card pab-group-card">
        <div className="pab-card-band">
          <span className="pab-card-org">Group</span>
        </div>
        <div className="pab-card-main">
          <div className="pab-photo">
            <Icon name="group" scale={3} />
          </div>
          <div className="pab-card-id">
            <div className="pab-card-name">
              <span>{g.name}</span>
            </div>
            <div className="pab-card-title">
              Mail group, {plural(members.length, "member")}
            </div>
          </div>
        </div>
        <ul className="pab-members">
          {members.map((c) => (
            <li key={c.id}>
              <span className="pab-member-name">{viewName(c)}</span>
              {c.email.trim() && <MailLink c={c} />}
            </li>
          ))}
          {!members.length && <li className="muted">This group has no members yet.</li>}
        </ul>
      </div>
    </div>
  );
}
