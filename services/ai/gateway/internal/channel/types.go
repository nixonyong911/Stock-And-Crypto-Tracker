package channel

// Info describes a registered messaging channel
type Info struct {
	Type         string   `json:"type"`          // telegram, whatsapp, discord, etc.
	Description  string   `json:"description"`
	WebhookURL   string   `json:"webhook_url,omitempty"`
	Capabilities []string `json:"capabilities,omitempty"`
}
